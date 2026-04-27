# Client

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

Unit tests run on [Vitest](https://vitest.dev/) via the Angular builder. From this directory:

```bash
npm test                  # watch mode
npm test -- --watch=false # single run (CI mode)
```

## Running end-to-end tests

E2E tests run on [Cypress 13](https://www.cypress.io/) — `cypress.config.ts` at the root of `client/`. The dev server must be up (`npm run start`) before opening Cypress.

```bash
npm run cy:open           # interactive runner
npm run cy:run            # headless run (used by CI)
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
