// A template's variables and its parts, checked: what fills the project's .env, who writes it, and
// how compose.yaml reads it (README.md, "template.json" and "Parts"). catalog.mjs reads the
// templates and calls it.
//
// A variable's value is the template's own: the project's address, random bytes, or a field. A
// part's are written by others. The machine writes a database part's, linking the database to
// the project before the app's first start, so compose.yaml reads them as ${NAME:?…}: a panel
// that links no database is refused rather than starting the app without one. New project writes
// the email part's from the provider the person picks, or empty with "Don't send email", so
// compose.yaml never requires them.

/** A variable's name in the project's .env. */
const variableRule = /^[A-Z][A-Z0-9_]*$/;

/** Random bytes a secret may be made of, written in hex: twice as many characters. */
const secretBytes = { min: 8, max: 64 };

/** The database parts, each with the prefix of what the machine writes into the project's .env
 *  (DatabaseLinkRequest.env_prefix): the catalog gives it to New project, which sends it. */
export const databaseParts = { postgres: 'DATABASE', valkey: 'REDIS' };

/** What the machine writes of a database after its prefix: how the app signs in. */
const databaseNames = ['URL', 'HOST', 'PORT', 'USER', 'PASSWORD', 'NAME'];

/** The sizes a database part may ask for, in MiB: the machine offers sizes doubling from 256, as
 *  far as its memory allows, and New project takes the one nearest above. */
const databaseSizes = [256, 512, 1024, 2048, 4096];

/** The size most apps need of each, the machine's default for its engine. */
const usualSizes = { postgres: 512, valkey: 256 };

const partKeys = [...Object.keys(databaseParts), 'email'];

/** What New project writes into an email part's variable (README.md, "Parts"). */
const emailValues = ['host', 'port', 'user', 'password', 'from', 'from_name', 'from_local', 'from_domain', 'from_header', 'enabled'];

/** What every provider has and every app needs to send mail at all. */
const emailNeeds = ['host', 'port', 'user', 'password'];

/** Checks a template's variables and parts against its compose.yaml. */
export function checkVariables(template, compose, fields, own) {
	if (!Array.isArray(template.variables)) return own('variables is a list, empty when the app needs none');

	// A service with env_file: .env reads every variable.
	const readsAll = /env_file:/.test(compose);
	const names = new Set();
	for (const variable of template.variables) {
		const { name, ...source } = variable;
		const where = `variable ${name}`;
		if (!variableRule.test(name ?? '')) own(`${where}: a name is capitals, digits and underscores`);
		if (names.has(name)) own(`${where} is listed twice`);
		names.add(name);

		if (!readsAll && readsOf(compose, name).length === 0) own(`${where} is read nowhere in compose.yaml`);
		checkSource(source, fields, (problem) => own(`${where}: ${problem}`));
	}

	const parts = template.parts === undefined ? {} : checkPartKeys(template.parts, own);
	if (parts === undefined) return;

	const taken = new Set(names);
	for (const [part, prefix] of Object.entries(databaseParts)) {
		checkDatabase(part, parts[part], prefix, names, compose, own);
		if (parts[part] !== undefined) for (const name of databaseNames) taken.add(`${prefix}_${name}`);
	}
	if (parts.email !== undefined) checkEmailPart(parts.email, taken, compose, readsAll, (problem) => own(`parts.email: ${problem}`));
}

/** Where a variable's value comes from: the project's address, random bytes, or a field. */
function checkSource(source, fields, own) {
	const kinds = ['from', 'secret', 'ask'].filter((kind) => kind in source);
	if (kinds.length !== 1) return own('has one of from, secret and ask');

	const allowed = { from: ['from'], secret: ['secret'], ask: ['ask', 'optional'] }[kinds[0]];
	const extra = Object.keys(source).filter((key) => !allowed.includes(key));
	if (extra.length > 0) own(`has no ${extra.join(', ')}`);

	if ('from' in source && !['url', 'host'].includes(source.from)) own('from is "url" or "host"');
	if ('secret' in source && !(Number.isInteger(source.secret) && source.secret >= secretBytes.min && source.secret <= secretBytes.max))
		own(`secret is a number of random bytes, from ${secretBytes.min} to ${secretBytes.max}`);
	if ('ask' in source && !(source.ask in fields)) own(`ask is a field of fields.json: ${Object.keys(fields).join(', ')}`);
	if ('optional' in source && source.optional !== true) own('optional is true, or left out');
}

/** parts, once it is found to be an object of parts; undefined when it is no object. An unknown
 *  part is refused: a panel that does not know it could only ignore it. */
function checkPartKeys(parts, own) {
	if (typeof parts !== 'object' || parts === null || Array.isArray(parts) || Object.keys(parts).length === 0) {
		own(`parts names what the app uses of ${partKeys.join(', ')}, as {"postgres": {"memory_mib": ${databaseSizes[1]}}}, or is left out`);
		return undefined;
	}
	for (const key of Object.keys(parts).filter((key) => !partKeys.includes(key))) own(`parts has no ${key}: it has ${partKeys.join(', ')}`);
	return parts;
}

/** A database part: its size, and the names the machine writes, which compose.yaml reads only as
 *  required and no variable takes. Without the part, a required read of one that is no variable
 *  is refused too: nothing would write it, and every deploy would be refused. */
function checkDatabase(part, spec, prefix, variables, compose, own) {
	const names = databaseNames.map((name) => `${prefix}_${name}`);
	const reads = names.flatMap((name) => readsOf(compose, name).map((read) => ({ name, ...read })));
	const required = reads.filter((read) => read.required);
	const example = `\${${prefix}_URL:?reload New project to link a database, or send link_databases with env_prefix ${prefix}}`;

	if (spec === undefined) {
		for (const read of required.filter((read) => !variables.has(read.name)))
			own(`compose.yaml reads ${read.text} on line ${read.line}, which the machine writes for a ${part} part only: add "parts": {"${part}": {"memory_mib": ${usualSizes[part]}}}`);
		return;
	}

	const where = `parts.${part}`;
	const extra = Object.keys(spec ?? {}).filter((key) => key !== 'memory_mib');
	if (!databaseSizes.includes(spec?.memory_mib) || extra.length > 0)
		own(`${where} is {"memory_mib": ${usualSizes[part]}}, its size in MiB: ${databaseSizes.join(', ')}`);

	for (const name of names.filter((name) => variables.has(name)))
		own(`variable ${name}: the machine writes it for the ${part} part: drop the variable, and read ${name} as \${${name}:?…}`);
	if (reads.length === 0) own(`${where}: compose.yaml reads none of ${names.join(', ')}: read the app’s as ${example}`);

	for (const read of reads) {
		const at = `compose.yaml reads ${read.text} on line ${read.line}`;
		if (!read.required) own(`${at}: read it as \${${read.name}:?…}, as ${example}, so a panel that links no database is refused`);
		else if (read.message.trim() === '') own(`${at}: say what to do in its message, as ${example}`);
		else if (!read.quoted && /: |#/.test(read.message)) own(`${at}: quote the value, as its message has ": " or "#": "${read.text}"`);
	}
}

/** An email part: its variables, each a value New project writes, read by compose.yaml as what may
 *  be empty. */
function checkEmailPart(email, taken, compose, readsAll, own) {
	const extra = Object.keys(email ?? {}).filter((key) => key !== 'variables');
	if (!Array.isArray(email?.variables) || email.variables.length === 0 || extra.length > 0)
		return own(`is {"variables": [{"name": "SMTP_HOST", "value": "host"}, …]}, each value one of ${emailValues.join(', ')}`);

	for (const variable of email.variables) {
		const { name, value, on, off, ...rest } = variable;
		const where = `variable ${name}`;
		if (!variableRule.test(name ?? '')) own(`${where}: a name is capitals, digits and underscores`);
		if (taken.has(name)) own(`${where} is the template’s already: a variable, a database part’s, or the email part’s`);
		taken.add(name);
		if (Object.keys(rest).length > 0) own(`${where} has no ${Object.keys(rest).join(', ')}: it has name, value, and on and off`);

		if (!emailValues.includes(value)) own(`${where}: value is one of ${emailValues.join(', ')}`);
		if ((on !== undefined || off !== undefined) && value !== 'enabled') own(`${where}: on and off go with "value": "enabled" only`);
		else if ((on === undefined) !== (off === undefined) || [on, off].some((word) => word !== undefined && typeof word !== 'string'))
			own(`${where}: on and off are both texts, what the app takes for sending and for not sending, or both left out for true and false`);

		const reads = readsOf(compose, name);
		if (!readsAll && reads.length === 0) own(`${where} is read nowhere in compose.yaml`);
		for (const read of reads.filter((read) => read.required))
			own(`${where}: compose.yaml reads ${read.text} on line ${read.line}: read it as \${${name}} or \${${name}:-…}, as it is empty with "Don’t send email" and from a panel that does not know the part`);
	}

	const mapped = new Set(email.variables.map((variable) => variable.value));
	const lacks = emailNeeds.filter((value) => !mapped.has(value));
	const sender = mapped.has('from') || mapped.has('from_header') || (mapped.has('from_local') && mapped.has('from_domain'));
	if (!sender) lacks.push('a sender (from, from_header, or from_local with from_domain)');
	if (lacks.length > 0) own(`gives the app ${emailNeeds.join(', ')} and a sender, which it needs to send mail: it lacks ${lacks.join(', ')}`);
}

/** Each place compose.yaml reads a variable, as Compose interpolates: $NAME or ${NAME…}, where $$
 *  is a dollar sign, so $$NAME is the container's to read. Each read has its text, its line, and
 *  whether it is required (${NAME:?message} or ${NAME?message}), with its message and whether the
 *  YAML value around it is quoted. */
function readsOf(compose, name) {
	const reads = [];
	const pattern = /(\$+)(\{?)([A-Za-z_][A-Za-z0-9_]*)/g;
	for (let match = pattern.exec(compose); match; match = pattern.exec(compose)) {
		if (match[1].length % 2 === 0 || match[3] !== name) continue;

		const start = match.index + match[1].length - 1;
		const end = match[2] ? closingBrace(compose, match.index + match[0].length) : match.index + match[0].length - 1;
		const modifier = match[2] ? compose.slice(match.index + match[0].length, end) : '';
		const required = /^:?\?/.exec(modifier);
		const lineStart = compose.lastIndexOf('\n', start) + 1;
		const before = compose.slice(lineStart, start);
		reads.push({
			text: compose.slice(start, end + 1),
			line: compose.slice(0, start).split('\n').length,
			required: required !== null,
			message: required ? modifier.slice(required[0].length) : '',
			quoted: (before.split('"').length - 1) % 2 === 1 || (before.split("'").length - 1) % 2 === 1
		});
	}
	return reads;
}

/** The index of the brace that closes one opened just before from, past any ${…} within. */
function closingBrace(text, from) {
	let depth = 1;
	for (let i = from; i < text.length; i++) {
		if (text[i] === '{') depth++;
		if (text[i] === '}' && --depth === 0) return i;
	}
	return text.length - 1;
}
