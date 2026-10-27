# Pethost templates

The one-click apps of [Pethost](https://pethost.dev), a small cloud for personal projects. Each
template is an app's Docker Compose file, written for Pethost, and the few values it needs.

[pethost.dev/templates](https://pethost.dev/templates/) has a page for each, with a button that
deploys it, and the panel lists them all in New project, under “From a template”. A template
merged here is on both within about 15 minutes.

## What a template is

A directory named by the template's id, which is also the project's id and the start of its
address: lower-case letters and digits, with hyphens between them (`uptime-kuma`). It holds three
files:

- `compose.yaml`: the app's services, as Pethost runs them;
- `logo.svg`: the app's own logo, or `logo.png`, 128 pixels wide, where the app's project draws
  none in vector;
- `template.json`: its name, its emoji, its page, its variables, and its texts.

### template.json

```json
{
	"name": "Vikunja",
	"emoji": "✅",
	"category": "productivity",
	"alternatives": ["Todoist", "Trello"],
	"plan": "starter",
	"route": { "service": "vikunja", "port": 3456 },
	"variables": [
		{ "name": "URL", "from": "url" },
		{ "name": "JWT_SECRET", "secret": 32 }
	],
	"texts": {
		"en": {
			"description": "To-do lists and projects, with kanban and Gantt views",
			"notes": "Open the address and register your account. …",
			"sizing": "Light: it takes little memory, and its database grows slowly.",
			"summary": "Self-host Vikunja, an open-source to-do and project app, …",
			"about": ["Vikunja is …", "…"],
			"faq": [{ "q": "Is Vikunja free?", "a": "Yes. …" }]
		}
	}
}
```

- `name`: the app's own name.
- `emoji`: the project's emoji in the panel.
- `category`: one of `categories.json`.
- `alternatives`: the products people run the app instead of, as their makers write them; the
  page says “A self-hosted alternative to …”. Empty when it stands in for none.
- `plan`: the smallest of Pethost's plans the app runs well on, with its databases and room to
  be used: `starter`, `grow` or `scale`.
- `route`: the service and the port whose page the project's address shows, with HTTPS. Left
  out when the app has no page.
- `variables`: what the project's `.env` holds, beside what its parts write. Each takes its value
  from one of:
  - `"from": "url"`: the project's address, `https://vikunja.yourname.pethost.app`; `"from":
    "host"`: the same without `https://`;
  - `"secret": 32`: so many random bytes, written in hex, so twice as many characters;
  - `"ask": "adminPassword"`: what the person types into one of the fields of `fields.json`.
    `"optional": true` lets them leave it empty, where the app runs without it.
- `parts`: the databases made with the app and the email it sends ("Parts", below). Left out when
  it uses none.
- `texts`: in every language of `languages.json`:
  - `description`: what the app is, in a line. It stands under the app's name in the list, and
    becomes the project's description.
  - `notes`: what to do first once the app is up. The project's notes start with it, and
    `{host}` in it stands for the project's address. With parts, they say where the data is, in
    the database linked to the project, and that mail is changed in the project's `.env`.
  - `sizing`: how much memory the app takes, beside the size of its databases, and how fast its
    data grows, roughly, in a short sentence. With `plan`, it answers the page's question of what
    the app needs.
  - `summary`: what a search engine shows of the app's page, 155 characters at most.
  - `about`: what the app is, who uses it, what it does and what this template runs, in a few
    paragraphs of plain text, for the page's “What is …?”.
  - `faq`: the questions people ask about the app, three at least, each answer standing on its
    own.

  `sizing`, `summary`, `about` and `faq` are the page's on pethost.dev only: the panel reads
  none of them.

  The app's name, the names of its pages, buttons and settings, its commands and its variables
  are written as the app writes them, in every language.

### compose.yaml

- An image is named by the line the app's project publishes (a major or a minor version), and by
  an exact release where it publishes no line.
- The app's data is kept in named volumes: Pethost backs them up every night.
- No port is published for the app's page: the route serves it. A port that is no web page, such
  as a game's or a mail server's, is published as the app needs it.
- A variable is read as `${NAME}`, or by `env_file: .env`; a part's as "Parts" says.

Pethost runs the file as it is written, or refuses it and says what to write instead.

### Parts

```json
"parts": {
	"postgres": { "memory_mib": 512 },
	"email": {
		"variables": [
			{ "name": "SMTP_HOST", "value": "host" },
			{ "name": "SMTP_PORT", "value": "port" },
			{ "name": "SMTP_USER", "value": "user" },
			{ "name": "SMTP_PASSWORD", "value": "password" },
			{ "name": "SMTP_FROM", "value": "from" },
			{ "name": "SMTP_DELIVERY", "value": "enabled", "on": "smtp", "off": "file" }
		]
	}
}
```

What the app uses besides its own containers, at most one of each. New project shows them under
the fields; a part the panel does not know yet keeps it from creating the app.

`postgres` and `valkey` are a database, a project of its own beside the app: Postgres 18 or
Valkey 9, of `memory_mib` MiB, 256, 512, 1024, 2048 or 4096 (512 for most apps that take
Postgres, 256 for Valkey). New project makes it before the app, at the size the machine offers
that is nearest above, or its largest. For Postgres the person may pick one of their databases
instead, where the app gets a user and a database of its own; Valkey is always a new one.

- The machine links the database to the project before the app's first container starts, and
  writes how the app signs in into the project's `.env`: `DATABASE_URL`, `DATABASE_HOST`,
  `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` and `DATABASE_NAME` for Postgres
  (`postgresql://user:password@host:5432/name`), and the same after `REDIS_` for Valkey
  (`redis://default:password@host:6379/0`). The URL is the one to give where the app takes one.
- compose.yaml reads them only as required, `${DATABASE_URL:?reload New project to link a
  Postgres database, or send link_databases with env_prefix DATABASE}`, so a panel that links no
  database, or an agent that deploys the file without a link, is refused with what to do instead
  of starting the app without one. Quote the value when the message has `: ` or `#`. No variable of the template takes one of
  these names.
- The app is no superuser in either. Its Postgres user owns its database and may create the
  extensions Postgres trusts, such as pgcrypto and citext, and nothing more; text sorts by code
  point (the builtin C.UTF-8). An app that needs a superuser, another extension or another image
  keeps a database container of its own, as Immich, InsForge and Windmill do.
- Postgres takes 22, 47 and 97 connections from apps at 256, 512 and 1024 MiB, which all the apps
  linked to it share: the app's pool stays within them, or the template asks for the next size.
- Valkey keeps everything in memory and evicts nothing (`noeviction`, at 70 % of its size): it
  suits queues, sessions and data. An app that uses it only as a cache uses its own memory cache
  instead.
- A service that runs on keeps `restart: unless-stopped` and migrates at its start under
  `set -e`, so it starts again until the database answers, after a reboot too. A job that runs
  once and needs the database tries for about two minutes before it fails, and never has
  `restart: always`.
- The database's backups and restores are its own, apart from the app's.

`email` is the provider the person picks in New project, from `email.json`: Resend, SendGrid or
Amazon SES, or “Don't send email”, which it starts at. New project writes the part's `variables`
into `.env`, each `value` one of:

- `host`, `port`, `user` and `password`: the provider's, given or typed in;
- `from`: the sender's address the person types, on a domain they verified at the provider;
  `from_local` and `from_domain`: that address before and after its `@`; `from_name`: the
  project's name; `from_header`: both, as `Name <address>`;
- `enabled`: `true` or `false`, or the variable's own `on` and `off`.

With “Don't send email” every value but `from_name` and `enabled` is empty, and a panel that
does not know the part writes none: compose.yaml reads them as `${SMTP_HOST}` or
`${SMTP_HOST:-…}`, never as required, and maps `enabled` to the app's switch where it has one.
Mail goes out by STARTTLS on the provider's port, 2587 or 2525, as 25, 465 and 587 are closed on
Pethost's machines: compose.yaml sets the app's STARTTLS mode. Mail from a `pethost.app` address
is refused: the person sends from a domain they own.

### Beside the templates

- `languages.json`: the languages every text is written in, the ones pethost.dev and the panel
  speak.
- `fields.json`: what a template may ask the person for: each field's label in every language,
  and its `type` (`password` is one the person makes up, `key` is one a service gave them; both
  are typed unseen) and `placeholder`. A new kind of field is a new entry.
- `email.json`: the providers of an email part, in New project's order: each one's `id`, `name`,
  STARTTLS `port`, `host` and `user` as `{"value": …}` or `{"ask": "<field>"}`, `password` as
  `{"ask": "<field>"}` of type `key`, and `help`, the provider's page that says where to find
  them; `from` is the field of the sender's address.
- `categories.json`: the kinds of apps, each with a page that lists its templates: its `name`,
  its `title`, its `summary` and its `intro` in every language. A slug is no template's id.
- `order.json`: the templates listed first, in this order. The rest follow by id.
- `catalog.mjs`: reads all of it for pethost.dev's build, and checks it: `node catalog.mjs`.
  `variables.mjs` checks a template's variables and parts for it.

## Adding a template

1. Write the three files. Write the texts in English: we add the other languages before the
   merge, so the check asks for them until then.
2. Run `node catalog.mjs` (Node 22 or newer). It says what is wrong, if anything.
3. Deploy it: on a Pethost machine, as a project from compose.yaml with the `.env` its variables
   make, or with `docker compose up`. A template with a database part runs on a Pethost machine
   only, where the machine writes its variables: make the database first (CreateDatabase, from
   an agent or the API), then the project linked to it (CreateProject's `link_databases`, with
   `env_prefix` `DATABASE` for Postgres and `REDIS` for Valkey); an email part's values go into
   `.env` by hand. Open its page, sign in if the app has accounts, restart it and its database,
   and see that its data is still there. `docker stats` says roughly what memory it takes, for
   its `plan`.
4. Open a pull request, and say what you checked.

A change to a template is checked the same way. A pull request that brings an app no one can
use without paying for something else, or that holds what the app's license does not let us
publish, is closed.

## License

MIT. The apps' names and logos are their owners' trademarks.
