@props(['url'])
<tr>
<td>
<table class="footer" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td class="content-cell" align="center">
{{--
    Static footer brand line. Default Laravel passes a `$slot` here
    that's usually empty for our notifications (verify-email +
    password reset don't append anything to it). Ignoring the slot
    keeps the footer predictable; if a future notification needs to
    inject extra text, route it through the notification's `line()`
    chain instead of the footer slot.
--}}
<p>© {{ date('Y') }} Budojo</p>
</td>
</tr>
</table>
</td>
</tr>
