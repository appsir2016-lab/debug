/* eslint-env mocha */

const assert = require('assert');
const debug = require('./src');

describe('debug', () => {
	it('passes a basic sanity check', () => {
		const log = debug('test');
		log.enabled = true;
		log.log = () => {};

		assert.doesNotThrow(() => log('hello world'));
	});

	it('allows namespaces to be a non-string value', () => {
		const log = debug('test');
		log.enabled = true;
		log.log = () => {};

		assert.doesNotThrow(() => debug.enable(true));
	});

	it('honors global debug namespace enable calls', () => {
		assert.deepStrictEqual(debug('test:12345').enabled, false);
		assert.deepStrictEqual(debug('test:67890').enabled, false);

		debug.enable('test:12345');
		assert.deepStrictEqual(debug('test:12345').enabled, true);
		assert.deepStrictEqual(debug('test:67890').enabled, false);
	});

	it('uses custom log function', () => {
		const log = debug('test');
		log.enabled = true;

		const messages = [];
		log.log = (...args) => messages.push(args);

		log('using custom log function');
		log('using custom log function again');
		log('%O', 12345);

		assert.deepStrictEqual(messages.length, 3);
	});

	describe('extend namespace', () => {
		it('should extend namespace', () => {
			const log = debug('foo');
			log.enabled = true;
			log.log = () => {};

			const logBar = log.extend('bar');
			assert.deepStrictEqual(logBar.namespace, 'foo:bar');
		});

		it('should extend namespace with custom delimiter', () => {
			const log = debug('foo');
			log.enabled = true;
			log.log = () => {};

			const logBar = log.extend('bar', '--');
			assert.deepStrictEqual(logBar.namespace, 'foo--bar');
		});

		it('should extend namespace with empty delimiter', () => {
			const log = debug('foo');
			log.enabled = true;
			log.log = () => {};

			const logBar = log.extend('bar', '');
			assert.deepStrictEqual(logBar.namespace, 'foobar');
		});

		it('should keep the log function between extensions', () => {
			const log = debug('foo');
			log.log = () => {};

			const logBar = log.extend('bar');
			assert.deepStrictEqual(log.log, logBar.log);
		});
	});

	describe('rebuild namespaces string (disable)', () => {
		it('handle names, skips, and wildcards', () => {
			debug.enable('test,abc*,-abc');
			const namespaces = debug.disable();
			assert.deepStrictEqual(namespaces, 'test,abc*,-abc');
		});

		it('handles empty', () => {
			debug.enable('');
			const namespaces = debug.disable();
			assert.deepStrictEqual(namespaces, '');
			assert.deepStrictEqual(debug.names, []);
			assert.deepStrictEqual(debug.skips, []);
		});

		it('handles all', () => {
			debug.enable('*');
			const namespaces = debug.disable();
			assert.deepStrictEqual(namespaces, '*');
		});

		it('handles skip all', () => {
			debug.enable('-*');
			const namespaces = debug.disable();
			assert.deepStrictEqual(namespaces, '-*');
		});

		it('names+skips same with new string', () => {
			debug.enable('test,abc*,-abc');
			const oldNames = [...debug.names];
			const oldSkips = [...debug.skips];
			const namespaces = debug.disable();
			assert.deepStrictEqual(namespaces, 'test,abc*,-abc');
			debug.enable(namespaces);
			assert.deepStrictEqual(oldNames.map(String), debug.names.map(String));
			assert.deepStrictEqual(oldSkips.map(String), debug.skips.map(String));
		});

		it('handles re-enabling existing instances', () => {
			debug.disable('*');
			const inst = debug('foo');
			const messages = [];
			inst.log = msg => messages.push(msg.replace(/^[^@]*@([^@]+)@.*$/, '$1'));

			inst('@test@');
			assert.deepStrictEqual(messages, []);
			debug.enable('foo');
			assert.deepStrictEqual(messages, []);
			inst('@test2@');
			assert.deepStrictEqual(messages, ['test2']);
			inst('@test3@');
			assert.deepStrictEqual(messages, ['test2', 'test3']);
			debug.disable('*');
			inst('@test4@');
			assert.deepStrictEqual(messages, ['test2', 'test3']);
		});
	});
	describe('formatting', () => {
		function capture(namespace) {
			const log = debug(namespace);
			log.enabled = true;
			log.useColors = false;
			const messages = [];
			log.log = (...args) => messages.push(args);
			return {log, messages};
		}

		it('replaces %% with a literal percent sign', () => {
			const {log, messages} = capture('test:percent');
			log('100%% done');
			assert.deepStrictEqual(messages.length, 1);
			assert.ok(messages[0][0].includes('100% done'));
		});

		it('formats an Error using its stack', () => {
			const {log, messages} = capture('test:error');
			const error = new Error('boom');
			log(error);
			assert.ok(messages[0][0].includes(error.stack));
		});

		it('inspects a non-string first argument with %O', () => {
			const {log, messages} = capture('test:object');
			const value = {answer: 42};
			log(value);
			// Node inlines the object through its %O formatter; browsers hand it
			// to the console as a separate argument.
			assert.deepStrictEqual(typeof messages[0][0], 'string');
			assert.ok(messages[0][0].includes('answer: 42') || messages[0].includes(value));
		});

		it('formats an Error without a stack using its message', () => {
			const {log, messages} = capture('test:error');
			const error = new Error('no stack here');
			error.stack = undefined;
			log(error);
			assert.ok(messages[0][0].includes('no stack here'));
			assert.ok(!messages[0][0].includes('undefined'));
		});
	});

	describe('namespace matching', () => {
		afterEach(() => {
			debug.enable('');
		});

		it('matches a trailing wildcard against an empty remainder', () => {
			debug.enable('abc*');
			assert.deepStrictEqual(debug('abc').enabled, true);
			assert.deepStrictEqual(debug('abcd').enabled, true);
			assert.deepStrictEqual(debug('ab').enabled, false);
		});

		it('backtracks over a wildcard in the middle of a namespace', () => {
			debug.enable('a*c');
			assert.deepStrictEqual(debug('ac').enabled, true);
			assert.deepStrictEqual(debug('abc').enabled, true);
			assert.deepStrictEqual(debug('abbbc').enabled, true);
			assert.deepStrictEqual(debug('abd').enabled, false);
			assert.deepStrictEqual(debug('abcd').enabled, false);
		});

		it('honors skips over enabled names', () => {
			debug.enable('test:*,-test:secret');
			assert.deepStrictEqual(debug('test:open').enabled, true);
			assert.deepStrictEqual(debug('test:secret').enabled, false);
		});

		it('treats whitespace as a separator', () => {
			debug.enable('one two  -three');
			assert.deepStrictEqual(debug.names, ['one', 'two']);
			assert.deepStrictEqual(debug.skips, ['three']);
		});
	});
});
