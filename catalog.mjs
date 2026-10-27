// The templates of this repository, read and checked: what pethost.dev's build reads to draw a
// page per template and the catalog the Pethost panel's New project lists, and what every pull
// request is checked with.
//
//   node catalog.mjs          checks the templates, and says what is wrong
//
// A template is a directory named by its id: compose.yaml, logo.svg or logo.png, and
// template.json (README.md says what each holds); variables.mjs checks its variables and parts.
// Beside them: languages.json, the languages every text is written in; fields.json, the fields a
// template may ask the person to fill in; email.json, the providers an email part offers;
// categories.json, the kinds of apps a template is listed under; order.json, the templates listed
// first, in that order, before the rest by id.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkVariables, databaseParts } from './variables.mjs';

/** A template's id: also the project's, and the first name of its address. */
const idRule = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const idLength = 40;

/** A host's name, as an email provider's: labels of letters, digits and hyphens, with dots
 *  between them. */
const hostRule = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** What a search result shows under a page's title, at most: a longer one is cut. */
const summaryLength = 155;

/** Pethost's plans, smallest first: a template's page says which one the app fits. */
const plans = ['starter', 'grow', 'scale'];

const templateKeys = ['name', 'emoji', 'category', 'alternatives', 'plan', 'route', 'variables', 'parts', 'texts'];

/** The templates in their order, each with its compose.yaml's text and its logo's file name, and
 *  what they share: the languages, the fields, the email providers, the categories and each
 *  database part's prefix (databaseParts). Throws with every problem found. */
export function readCatalog(dir) {
	const problems = [];
	const read = (file) => readJson(join(dir, file), file, problems);

	const languages = read('languages.json') ?? [];
	const fields = read('fields.json') ?? {};
	const email = read('email.json') ?? {};
	const categories = read('categories.json') ?? {};
	const order = read('order.json') ?? [];
	checkFields(fields, languages, problems);
	checkEmail(email, fields, problems);

	const ids = readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
		.map((entry) => entry.name)
		.sort();
	checkOrder(order, ids, problems);
	checkCategories(categories, languages, ids, problems);

	const listed = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];
	const templates = listed.map((id) => readTemplate(dir, id, { languages, fields, categories }, problems));

	if (problems.length > 0) throw new Error(`The templates have ${problems.length} problems:\n${problems.join('\n')}`);
	return { languages, fields, email, categories, databaseParts, templates };
}

function readTemplate(dir, id, shared, problems) {
	const own = (problem) => problems.push(`${id}: ${problem}`);
	if (!idRule.test(id) || id.length > idLength) own(`the id is lower-case letters and digits, with hyphens between them, ${idLength} at most`);

	const files = readdirSync(join(dir, id));
	const logos = files.filter((file) => file === 'logo.svg' || file === 'logo.png');
	const extra = files.filter((file) => !['compose.yaml', 'template.json', 'logo.svg', 'logo.png'].includes(file));
	if (logos.length !== 1) own('has logo.svg or logo.png, one of them');
	if (extra.length > 0) own(`has only compose.yaml, template.json and the logo, not ${extra.join(', ')}`);

	const compose = existsSync(join(dir, id, 'compose.yaml')) ? readFileSync(join(dir, id, 'compose.yaml'), 'utf8') : '';
	if (!compose) own('has no compose.yaml');

	const template = readJson(join(dir, id, 'template.json'), `${id}/template.json`, problems) ?? {};
	checkTemplate(template, compose, shared, own);

	return { id, ...template, compose, logo: logos[0] };
}

function checkTemplate(template, compose, { languages, fields, categories }, own) {
	for (const key of Object.keys(template)) {
		if (!templateKeys.includes(key)) own(`template.json has no ${key}: it has ${templateKeys.join(', ')}`);
	}
	if (!text(template.name)) own('name is the app’s own name');
	if (!text(template.emoji)) own('emoji is the project’s emoji');
	if (!(template.category in categories)) own(`category is one of categories.json: ${Object.keys(categories).join(', ')}`);
	if (!Array.isArray(template.alternatives) || !template.alternatives.every(text))
		own('alternatives is a list of the products the app stands in for, empty when it stands in for none');
	if (!plans.includes(template.plan)) own(`plan is the smallest plan the app runs well on: ${plans.join(', ')}`);
	if (template.route !== undefined) checkRoute(template.route, compose, own);

	checkVariables(template, compose, fields, own);

	checkTexts(template.texts, languages, own);
}

function checkRoute(route, compose, own) {
	if (!text(route.service) || !Number.isInteger(route.port) || route.port < 1 || route.port > 65535)
		own('route is the service and the port its page is served at: {"service": "app", "port": 8080}');
	else if (!new RegExp(`^  ${route.service}:`, 'm').test(compose)) own(`route names ${route.service}, a service compose.yaml lacks`);
}

function checkTexts(texts, languages, own) {
	if (typeof texts !== 'object' || texts === null) return own('texts has the app’s texts in every language');

	for (const code of languages) {
		const { description, notes, sizing, summary, about, faq, ...extra } = texts[code] ?? {};
		const where = `texts.${code}`;
		if (!text(description)) own(`${where}.description is missing`);
		if (!text(notes)) own(`${where}.notes is missing`);
		if (/\{(?!host\})[^}]*\}/.test(notes ?? '')) own(`${where}.notes holds no {…} but {host}`);
		if (!text(sizing)) own(`${where}.sizing is missing`);
		checkSummary(summary, `${where}.summary`, own);
		if (!Array.isArray(about) || about.length < 2 || !about.every(text)) own(`${where}.about is a list of paragraphs, two at least`);
		if (!Array.isArray(faq) || faq.length < 3 || !faq.every((item) => text(item?.q) && text(item?.a) && Object.keys(item).length === 2))
			own(`${where}.faq is a list of questions and answers, three at least: [{"q": "…", "a": "…"}]`);
		if (Object.keys(extra).length > 0) own(`${where} has only description, notes, sizing, summary, about and faq`);
	}
	for (const code of Object.keys(texts)) {
		if (!languages.includes(code)) own(`texts.${code}: ${code} is not in languages.json`);
	}
}

/** The kinds of apps: a page each, beside the templates' own pages, so a slug is no template's
 *  id. */
function checkCategories(categories, languages, ids, problems) {
	for (const [slug, category] of Object.entries(categories)) {
		const own = (problem) => problems.push(`categories.json: ${slug}: ${problem}`);
		if (!idRule.test(slug) || ids.includes(slug)) own('a slug is lower-case words with hyphens between them, and no template’s id');
		for (const code of languages) {
			if (!text(category.name?.[code])) own(`name.${code} is missing`);
			if (!text(category.title?.[code])) own(`title.${code} is missing`);
			checkSummary(category.summary?.[code], `summary.${code}`, own);
			const intro = category.intro?.[code];
			if (!Array.isArray(intro) || intro.length === 0 || !intro.every(text)) own(`intro.${code} is a list of paragraphs`);
		}
	}
}

function checkSummary(summary, where, own) {
	if (!text(summary)) own(`${where} is missing`);
	else if (summary.length > summaryLength) own(`${where} is ${summary.length} characters: a search result shows ${summaryLength}`);
}

function checkFields(fields, languages, problems) {
	for (const [name, field] of Object.entries(fields)) {
		const own = (problem) => problems.push(`fields.json: ${name}: ${problem}`);
		if (field.type !== undefined && !['password', 'key'].includes(field.type)) own('type is "password" or "key", or left out');
		if (field.placeholder !== undefined && !text(field.placeholder)) own('placeholder is a text');
		for (const code of languages) {
			if (!text(field.label?.[code])) own(`label.${code} is missing`);
		}
	}
}

/** The providers an email part offers, in New project's order, each sending by STARTTLS on its
 *  port: its host and user, given or asked, and its password, asked unseen. */
function checkEmail(email, fields, problems) {
	const own = (problem) => problems.push(`email.json: ${problem}`);
	const unknown = Object.keys(email).filter((key) => !['from', 'providers'].includes(key));
	if (unknown.length > 0) own(`has no ${unknown.join(', ')}: it has from and providers`);
	if (!(email.from in fields) || fields[email.from].type !== undefined) own('from is a field of fields.json with no type: the sender’s address');
	if (!Array.isArray(email.providers) || email.providers.length === 0) return own('providers lists the providers New project offers');

	const ids = new Set();
	for (const [i, provider] of email.providers.entries()) {
		const { id, name, host, port, user, password, help, ...extra } = provider;
		const where = (problem) => own(`providers[${i}], ${id}: ${problem}`);
		if (!idRule.test(id ?? '') || ids.has(id)) where('id is lower-case letters and digits, with hyphens between them, and no other provider’s');
		ids.add(id);
		if (Object.keys(extra).length > 0) where(`has no ${Object.keys(extra).join(', ')}: it has id, name, host, port, user, password and help`);

		if (!text(name)) where('name is the provider’s own name');
		if (!Number.isInteger(port) || port < 1 || port > 65535) where('port is the one its STARTTLS is on');
		if (!givenOrAsked(host, fields) || ('value' in host && !hostRule.test(host.value)))
			where('host is {"value": "smtp.example.com"}, or {"ask": "<field>"} for one the person copies');
		if (!givenOrAsked(user, fields)) where('user is {"value": "<the same for everyone>"}, or {"ask": "<field>"}');
		if (Object.keys(password ?? {}).join() !== 'ask' || fields[password.ask]?.type !== 'key')
			where('password is {"ask": "<field>"}, a field of type key, which the person copies from the provider and types unseen');
		if (!URL.canParse(help ?? '') || new URL(help).protocol !== 'https:') where('help is the https address of the provider’s page that gives these');
	}
}

/** A value an email provider gives everyone, or a field of fields.json the person fills in. */
function givenOrAsked(spec, fields) {
	const keys = Object.keys(spec ?? {}).join();
	return (keys === 'value' && text(spec.value)) || (keys === 'ask' && spec.ask in fields);
}

function checkOrder(order, ids, problems) {
	if (!Array.isArray(order)) return problems.push('order.json is a list of ids');
	for (const id of order) {
		if (!ids.includes(id)) problems.push(`order.json: ${id} is no template here`);
	}
	if (new Set(order).size !== order.length) problems.push('order.json lists an id twice');
}

function readJson(path, name, problems) {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch (error) {
		problems.push(`${name}: ${error.code === 'ENOENT' ? 'is missing' : error.message}`);
		return undefined;
	}
}

const text = (value) => typeof value === 'string' && value.trim() !== '';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const { templates } = readCatalog(fileURLToPath(new URL('.', import.meta.url)));
		console.log(`${templates.length} templates, every one well.`);
	} catch (error) {
		console.error(error.message);
		process.exit(1);
	}
}
