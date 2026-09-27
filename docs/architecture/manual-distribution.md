# Manual Assist Distribution

Manual Assist is the compliant human-in-the-loop path for a Destination that RecruitOps cannot or should not publish to through an official provider API.

## Boundary

Manual Assist prepares an instruction. It does not automate browser controls, scrape a user session, call undocumented provider endpoints, or pretend the post was published.

The current provider:
1. resolves the saved Destination;
2. requires the Destination to be enabled and configured with `postingMode=MANUAL`;
3. checks that the publish command platform matches the Destination platform;
4. formats copyable post text;
5. returns checklist codes for the UI;
6. leaves final publication and confirmation to the operator.

## i18n

Checklist values are stable domain codes:
- `OPEN_DESTINATION`
- `ATTACH_MEDIA`
- `PASTE_CONTENT`
- `REVIEW_CONTENT`
- `PUBLISH_MANUALLY`
- `CONFIRM_PUBLICATION`

They are not user-facing English strings. The frontend translates each code through the normal VI/EN i18n layer.

## Publication state integration

A future application service will create a Publication before preparing Manual Assist. The operator confirmation action will be responsible for moving that Publication to `PUBLISHED` with any manually supplied external URL/identifier. Preparing an instruction alone must never mark a Publication as published.
