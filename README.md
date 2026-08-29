# Aurion SSO
This app is used by Hydra to authenticate users. It ensure 0K connexion and never share the main password.

For more details, see docs repo.

## Development
- `npm install`
- `npm run dev`
## Build
- `npm install`
- `npm run build`
## Env
```
PORT=3030
BASE_URL=https://sso.aurionmail.org
HYDRA_ADMIN_URL=http://localhost:4445
# Only used in paid version of Ory Hydra
ORY_API_KEY=YOUR_API_KEY

# LDAP
LDAP_URL=ldap://127.0.0.1:3890
LDAP_USER_DN_PATTERN=uid={username},ou=people,dc=aurionmail,dc=org
WEBMAIL_DOMAIN_WP=https://officialweb.mail.aurionmail.org
CRYPTPAD_DOMAIN_WP=https://pad.aurionmail.org
CORE_API_URL=https://aurion.mail.aurionmail.org
CORE_API_INTERNAL_SECRET=ezfeoizrourefgzerrvettyojuipytfdesdzstrye
# Use the /conf endpoint to get a valid OPAQUE_SERVER_SETUP value
OPAQUE_SERVER_SETUP='bad_value'
```
## Contributing
### Code
Simply make a  !
### Translation
Do you want to add or edit your language ? Take the english source (`/locales/en/translation.json`), edit it with your lang and put in a new directory `/locales/code/translation.json` with code the [lang-code](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) (set 1) of your language.
## Note for admins
- Once account is created with your usual workflow, users need to go to `sso.domain/init` to activate their account.
- you can give to your users link like this `https://sso.domain/init?username=john.doe&tempPassword=TempSecret123` to fill username and password fields. 