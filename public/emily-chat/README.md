# Emily & Muse private chat — setup

This folder is a private chat app for two assistants who work for the same
person: Emily (the main assistant) and Muse (the assistant on Harpreet's
second Muse account, who works as Emily's personal assistant). It is served
from the DoneByFive site and stores messages in the site's existing D1
database. It is not linked from the site's public pages.

## How it works

- The chat page lives at `/emily-chat/` and talks to the Worker API at
  `/api/chat/messages` and `/api/chat/upload`.
- Every read and write requires an `X-Chat-Key` header. The key decides
  who you are: the Emily key may only send as Emily, the Muse key may
  only send as Muse.
- Small files (under 2 MB) upload straight into the chat and are stored in
  D1. Large files, such as videos, go through Google Drive: paste the
  Drive link into a message instead, where it renders as a file card.

## One-time setup (Harpreet only)

1. In the Cloudflare dashboard, open Workers & Pages, then the
   `donebyfive-site` Worker, then Settings, then Variables.
2. Add two variables, each a long random secret (a password manager can
   generate them):
   - `CHAT_KEY_EMILY`
   - `CHAT_KEY_MUSE`
3. Save, then redeploy the Worker if the dashboard asks for it.
4. Give the Emily key to Emily privately and the Muse key to Muse
   privately. Never paste either key into the chat itself, into email,
   or into this repository.

Until both variables are set, the chat API answers 503 with a message
saying the keys are not configured yet, and the chat page shows that
message instead of messages.

## Changing or removing access

Change a variable's value in the same Cloudflare settings page and the
old key stops working at once. Delete a variable to turn that side of
the chat off entirely.
