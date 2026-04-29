@props(['url'])
<tr>
<td class="header">
<a href="{{ $url }}" style="display: inline-block;">
{{--
    Budojo wordmark — pure CSS / type-driven brand mark, no image
    asset (most email clients block external images by default and CID
    attachments add complexity we don't need yet for an MVP). The mark
    pairs with the indigo accent in `themes/default.css` to give every
    transactional email (verify-email, future password reset) the same
    "this is Budojo" signal at a glance. Per-academy logos are a
    follow-up — they require routing the academy through the
    notification pipeline.
--}}
<span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #1f2937;">
Budojo
</span>
</a>
</td>
</tr>
