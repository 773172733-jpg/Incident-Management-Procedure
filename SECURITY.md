# Security Notes

This repository keeps `project.config.json` public-safe. The tracked `appid`
must stay as `touristappid`.

Before running the mini program in WeChat DevTools, set the real AppID locally
if your DevTools session requires it. Do not commit the real AppID, AppSecret,
cloud secret keys, access tokens, or private environment credentials.

If a real credential has already been pushed:

1. Rotate or revoke the credential in the provider console.
2. Push a follow-up commit that removes it from tracked files.
3. Resolve the GitHub secret-scanning alert after confirming the credential is
   no longer usable.

