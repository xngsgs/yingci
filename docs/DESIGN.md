# 映词 v0.1 design

Audience: people who can describe their wishes in everyday Chinese but do not know image-prompt terminology.

Primary job: turn a reference and a conversation into an understandable, editable image prompt. Ask at most one or two useful questions, offer a reasonable draft, preserve accepted decisions.

Palette: canvas #F7F8FA; surface #FFFFFF; ink #20212C; violet #6F648F; tint #EEEAF4; sage #8B9A8F; line #E6E7EC.

Typography: Segoe UI Variable for Latin/UI; Microsoft YaHei UI and PingFang SC for Chinese. Quiet, readable body text; 24px conversation heading, 16px panel headings, 14px body. No remote font requests.

Layout: an editing desk with a photographic reference at left, spacious conversation at center, and a living prompt at right. Panels share a single canvas and thin dividers; they are not a grid of cards. Left alignment throughout.

```
brand / recent creations                      connection / new
reference & editable scope | conversation       | current prompt
image + observations      | suggestions        | bilingual fields
what to keep              | composer           | locks / versions
```

The photograph provides the visual anchor. Icons use one consistent stroke system; no decorative dashboards, metrics, or gradients. On narrower screens the conversation comes first, with a reference/prompt tab bar. Dialogs explain empty states and failures in ordinary language. Local project files provide persistence independently of browser storage quotas.

Self-review before implementation: removed a marketing hero, feature tiles and model/provider labels from the main creation flow. Kept the connection state visible because users need to distinguish scripted examples from actual model responses. Chose flat panels and different spacing by role rather than identical floating cards.
