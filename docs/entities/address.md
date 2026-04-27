# Entity — `Address`

## Purpose

Structured postal address attached to any owner via Laravel's polymorphic `morphTo` (#72). Owners today: `Academy` (#72a) and `Athlete` (#72b). Future milestones can add instructors / event venues with zero schema change. Replaces the freeform `academies.address` text column that lived through the M0–M3 milestones; athletes never had a freeform column, so #72b is purely additive on that side.

The polymorphic shape was a deliberate trade-off: we gain "any entity can have an address" at the cost of a database-level FK constraint on the owner. Eloquent's `morphTo` carries that integrity at the application layer, and the composite `(addressable_type, addressable_id)` index covers every read pattern (we always load addresses through the owner, never standalone).

## Schema — `addresses`

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `id` | bigint unsigned | PK, auto-increment | |
| `addressable_type` | string | not null, **part of composite index** | Owner class FQN, e.g. `App\Models\Academy` |
| `addressable_id` | bigint unsigned | not null, **part of composite index** | Owner row id |
| `line1` | string(255) | nullable | Street + civic number, e.g. `Via Roma 1` |
| `line2` | string(255) | nullable | Floor / apt / unit, e.g. `Scala B, interno 4` |
| `city` | string(100) | nullable | Free-text city name |
| `postal_code` | string(20) | nullable | Country-specific format. For IT, 5 digits |
| `province` | string(5) | nullable | ISO 3166-2 sub-code; for IT, the 2-letter province code (e.g. `RM`, `MI`) |
| `country` | string(2) | not null, default `'IT'` | ISO 3166-1 alpha-2 |
| `created_at` | timestamp | nullable | |
| `updated_at` | timestamp | nullable | |

**DB permissive, API strict.** All structured fields are nullable in the schema so the migration could survive the legacy backfill (a freeform string with no city / postal code parsed out). Application-level validation (`StoreAcademyRequest`, `UpdateAcademyRequest`) enforces completeness on every write — when an address is sent at the API layer, all required fields (`line1`, `city`, `postal_code`, `province`, `country`) must be present and valid.

## Relations

- `morphTo()` — exposed as `addressable()`. Resolves to the concrete owner model based on `addressable_type`.

## Indexes

- `PRIMARY KEY(id)`
- `UNIQUE(addressable_type, addressable_id)` — composite. Doubles as the lookup index (always loaded via the owner relation) and as the DB-level enforcement of the 1:1 invariant. The migration declares the morph columns manually rather than via `Blueprint::morphs()` precisely because we need the index to be unique, not regular.

## Enums

### `App\Enums\Country`

| Case | Value | Notes |
|---|---|---|
| `IT` | `IT` | The only supported country in MVP |

Adding a country is a code change (extra enum case + per-country regex / province enum dispatch) without a schema change. The column is sized for the standard 2-char alpha-2 code.

### `App\Enums\ItalianProvince`

107 cases — the standard two-letter Italian car-plate / postal codes. Includes the metropolitan cities and free consortia of the post-2016 reform; the `SU` (Sud Sardegna) case replaces the four abolished Sardinian provinces (Carbonia-Iglesias, Medio Campidano, Olbia-Tempio, Ogliastra). Required server-side on every IT-country address.

## Business rules

- **One address per owner.** Enforced by **two layers** working together — `morphOne` alone is not enough (Eloquent's morph relation is a "first match wins" hint, not an invariant):
  1. **DB:** a UNIQUE index on `(addressable_type, addressable_id)` in the `addresses` table. Concurrent inserts that race past the application-level "is there already a row?" check fail at the constraint instead of silently producing a duplicate.
  2. **Application:** `App\Actions\Address\SyncAddressAction` goes through the relation's `updateOrCreate(...)`, which is keyed on the morph columns and atomic from the caller's perspective. Every owner uses the same action — `Academy` and `Athlete` today, future entities tomorrow.
- **Orphan cleanup on hard delete.** The polymorphic table has no FK to its owner, so when an owner is permanently deleted the address row would otherwise survive. Each owner therefore carries an observer hook: `AcademyObserver::deleted` and `AthleteObserver::forceDeleted` both wipe their address row. Soft delete leaves the address in place — recoverable until the parent row itself is purged.
- **Address is optional.** An academy can have `address = null` (legitimate state — every owner can clear it). `PATCH /api/v1/academy` with `"address": null` deletes the morph row; `"address": { ... }` upserts; omitting the key leaves the existing row untouched.
- **All-or-nothing on write.** When the API receives an `address` object, every required field (`line1`, `city`, `postal_code`, `province`, `country`) must be filled. Half-filled payloads are rejected with 422 — the FormRequest's `required_with:address` rule is what enforces this. The SPA mirrors the rule client-side via a `FormGroup`-level `addressAllOrNothing` validator.
- **Postal code regex is country-specific.** For IT, `^\d{5}$` (the 5-digit CAP). Future countries get their own regex dispatched from the `country` field (a `match($country)` inside `withValidator()` rather than a static rule).
- **Province codes are validated against the `ItalianProvince` enum.** When `country !== 'IT'`, the field is conceptually optional (no other country uses these codes); MVP rejects non-IT countries entirely so this branch isn't exercised yet.

## Related endpoints

- The address has no own endpoints. It's read and written through the owner's resource (e.g. `GET / PATCH /api/v1/academy`). Sub-payload shape: `{ "address": { line1, line2, city, postal_code, province, country } | null }`.

## Related tables

- `academies` — see [`academy.md`](./academy.md). First owner (#72a).
- `athletes` — see [`athlete.md`](./athlete.md). Second owner (#72b).

## Future

- Non-IT countries — adds a `Country` enum case, a country-specific postal-code regex branch, and a per-country province enum (or null when the country doesn't use province subdivisions).
- Additional owners (instructors, event venues) — implement `App\Contracts\HasAddress` + add `morphOne(Address::class, 'addressable')` and an observer hook for orphan cleanup. Zero schema change.
