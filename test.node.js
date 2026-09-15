/* eslint-env mocha */

const assert = require('assert');
const util = require('util');
const tty = require('tty');
const Module = require('module');
const sinon = require('sinon');
const debug = require('./src/node');

const formatWithOptionsSpy = sinon.spy(util, 'formatWithOptions');
beforeEach(() => {
	formatWithOptionsSpy.resetHistory();
});

describe('debug node', () => {
	describe('formatting options', () => {
		it('calls util.formatWithOptions', () => {
			debug.enable('*');
			const stdErrWriteStub = sinon.stub(process.stderr, 'write');
			const log = debug('formatting options');
			log('hello world');
			assert(util.formatWithOptions.callCount === 1);
			stdErrWriteStub.restore();
		});

		it('calls util.formatWithOptions with inspectOpts', () => {
			debug.enable('*');
			const options = {
				hideDate: true,
				colors: true,
				depth: 10,
				showHidden: true
			};
			Object.assign(debug.inspectOpts, options);
			const stdErrWriteStub = sinon.stub(process.stderr, 'write');
			const log = debug('format with inspectOpts');
			log('hello world2');
			assert.deepStrictEqual(util.formatWithOptions.getCall(0).args[0], options);
			stdErrWriteStub.restore();
		});
	});
	describe('environment options', () => {
		const modulePath = require.resolve('./src/node');
		let savedEnv;

		beforeEach(() => {
			savedEnv = {};
			for (const key of Object.keys(process.env)) {
				if (/^debug_/i.test(key)) {
					savedEnv[key] = process.env[key];
					delete process.env[key];
				}
			}
		});

		afterEach(() => {
			for (const key of Object.keys(process.env)) {
				if (/^debug_/i.test(key)) {
					delete process.env[key];
				}
			}
			Object.assign(process.env, savedEnv);
		});

		function loadFresh() {
			const cached = require.cache[modulePath];
			delete require.cache[modulePath];
			try {
				return require('./src/node');
			} finally {
				require.cache[modulePath] = cached;
			}
		}

		function loadFreshWith(supportsColor) {
			const originalLoad = Module._load;
			const stub = sinon.stub(Module, '_load').callsFake(function (request, ...rest) {
				if (request === 'supports-color') {
					if (supportsColor instanceof Error) {
						throw supportsColor;
					}
					return supportsColor;
				}
				return originalLoad.call(this, request, ...rest);
			});
			try {
				return loadFresh();
			} finally {
				stub.restore();
			}
		}

		it('parses DEBUG_* variables into inspectOpts', () => {
			process.env.DEBUG_COLORS = 'yes';
			process.env.DEBUG_SHOW_HIDDEN = 'enabled';
			process.env.DEBUG_HIDE_DATE = 'off';
			process.env.DEBUG_SORTED = 'false';
			process.env.DEBUG_COMPACT = 'null';
			process.env.DEBUG_DEPTH = '10';
			const fresh = loadFresh();
			assert.deepStrictEqual(fresh.inspectOpts, {
				colors: true,
				showHidden: true,
				hideDate: false,
				sorted: false,
				compact: null,
				depth: 10
			});
		});

		it('starts with empty inspectOpts when no DEBUG_* variable is set', () => {
			assert.deepStrictEqual(loadFresh().inspectOpts, {});
		});

		it('uses the extended palette when supports-color reports level 2 or more', () => {
			const fresh = loadFreshWith({stderr: {level: 2}});
			assert.deepStrictEqual(fresh.colors.length, 76);
			assert.deepStrictEqual(fresh.colors[0], 20);
			assert.deepStrictEqual(fresh.colors[75], 221);
		});

		it('uses the basic palette when supports-color reports a lower level', () => {
			const fresh = loadFreshWith({stderr: {level: 1}});
			assert.deepStrictEqual(fresh.colors, [6, 2, 3, 4, 5, 1]);
		});

		it('accepts the older supports-color shape without a stderr property', () => {
			const fresh = loadFreshWith({level: 3});
			assert.deepStrictEqual(fresh.colors.length, 76);
		});

		it('uses the basic palette when supports-color is not installed', () => {
			const fresh = loadFreshWith(new Error('Cannot find module \'supports-color\''));
			assert.deepStrictEqual(fresh.colors, [6, 2, 3, 4, 5, 1]);
		});

		it('selects the browser build when process.browser is set', () => {
			const indexPath = require.resolve('./src');
			const browserPath = require.resolve('./src/browser');
			const cachedIndex = require.cache[indexPath];
			const cachedBrowser = require.cache[browserPath];
			delete require.cache[indexPath];
			delete require.cache[browserPath];
			process.browser = true;
			try {
				const fresh = require('./src');
				assert.deepStrictEqual(typeof fresh.colors[0], 'string');
			} finally {
				delete process.browser;
				require.cache[indexPath] = cachedIndex;
				require.cache[browserPath] = cachedBrowser;
			}
		});
	});

	describe('useColors', () => {
		let savedInspectOpts;

		beforeEach(() => {
			savedInspectOpts = {...debug.inspectOpts};
		});

		afterEach(() => {
			for (const key of Object.keys(debug.inspectOpts)) {
				delete debug.inspectOpts[key];
			}
			Object.assign(debug.inspectOpts, savedInspectOpts);
		});

		it('follows inspectOpts.colors when it is set', () => {
			debug.inspectOpts.colors = false;
			assert.deepStrictEqual(debug.useColors(), false);
			debug.inspectOpts.colors = 'yes';
			assert.deepStrictEqual(debug.useColors(), true);
		});

		it('falls back to whether stderr is a TTY', () => {
			delete debug.inspectOpts.colors;
			const stub = sinon.stub(tty, 'isatty');
			try {
				stub.returns(true);
				assert.deepStrictEqual(debug.useColors(), true);
				stub.returns(false);
				assert.deepStrictEqual(debug.useColors(), false);
			} finally {
				stub.restore();
			}
		});
	});

	describe('formatArgs', () => {
		let savedInspectOpts;

		beforeEach(() => {
			savedInspectOpts = {...debug.inspectOpts};
		});

		afterEach(() => {
			for (const key of Object.keys(debug.inspectOpts)) {
				delete debug.inspectOpts[key];
			}
			Object.assign(debug.inspectOpts, savedInspectOpts);
		});

		function capture(namespace, options) {
			const log = debug(namespace);
			log.enabled = true;
			Object.assign(log, options);
			const calls = [];
			log.log = (...args) => calls.push(args);
			return {log, calls};
		}

		it('prefixes the namespace and appends the diff when colors are enabled', () => {
			const {log, calls} = capture('colors', {useColors: true, color: 6});
			log('hello');
			assert.deepStrictEqual(calls[0][0], '  \u001B[36;1mcolors \u001B[0mhello');
			assert.ok(calls[0][1].startsWith('\u001B[36m+'));
			assert.ok(calls[0][1].endsWith('ms\u001B[0m'));
		});

		it('uses the 256-color escape for palette entries above 7', () => {
			const {log, calls} = capture('colors256', {useColors: true, color: 20});
			log('hello');
			assert.deepStrictEqual(calls[0][0], '  \u001B[38;5;20;1mcolors256 \u001B[0mhello');
		});

		it('repeats the prefix on every line of a multi-line message', () => {
			const {log, calls} = capture('multi', {useColors: true, color: 2});
			log('one\ntwo');
			const prefix = '  \u001B[32;1mmulti \u001B[0m';
			assert.deepStrictEqual(calls[0][0], prefix + 'one\n' + prefix + 'two');
		});

		it('prefixes an ISO date and the namespace when colors are disabled', () => {
			debug.inspectOpts.hideDate = false;
			const {log, calls} = capture('plain', {useColors: false});
			log('hello');
			assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z plain hello$/.test(calls[0][0]));
			assert.deepStrictEqual(calls[0].length, 1);
		});

		it('omits the date when hideDate is set', () => {
			debug.inspectOpts.hideDate = true;
			const {log, calls} = capture('nodate', {useColors: false});
			log('hello');
			assert.deepStrictEqual(calls[0][0], 'nodate hello');
		});
	});

	describe('formatters', () => {
		const wide = {
			alpha: 'a'.repeat(60),
			beta: 'b'.repeat(60),
			gamma: 'c'.repeat(60)
		};

		function capture(namespace) {
			const log = debug(namespace);
			log.enabled = true;
			log.useColors = false;
			const calls = [];
			log.log = (...args) => calls.push(args);
			return {log, calls};
		}

		it('%o inspects the value on a single line', () => {
			const {log, calls} = capture('single');
			log('%o', wide);
			assert.deepStrictEqual(calls[0].length, 1);
			assert.ok(!calls[0][0].includes('\n'));
			assert.ok(calls[0][0].includes('alpha: \'' + wide.alpha + '\''));
			assert.deepStrictEqual(log.inspectOpts.colors, false);
		});

		it('%O inspects the value across multiple lines', () => {
			const {log, calls} = capture('multi');
			log('%O', wide);
			assert.deepStrictEqual(calls[0].length, 1);
			assert.ok(calls[0][0].includes('\n'));
		});

		it('%O honors the instance inspectOpts', () => {
			const {log, calls} = capture('depth');
			log.inspectOpts.depth = 0;
			log('%O', {nested: {deep: true}});
			assert.ok(calls[0][0].includes('[Object]'));
		});

		it('passes useColors through to util.inspect', () => {
			const {log, calls} = capture('inspect-colors');
			log.useColors = true;
			log.color = 6;
			log('%O', {answer: 42});
			assert.deepStrictEqual(log.inspectOpts.colors, true);
			assert.ok(calls[0][0].includes('\u001B[33m42\u001B[39m'));
		});
	});

	describe('save and load', () => {
		let original;

		beforeEach(() => {
			original = process.env.DEBUG;
		});

		afterEach(() => {
			debug.enable(original);
		});

		it('persists enabled namespaces in process.env.DEBUG', () => {
			debug.enable('save:*');
			assert.deepStrictEqual(process.env.DEBUG, 'save:*');
			assert.deepStrictEqual(debug.load(), 'save:*');
		});

		it('removes DEBUG from the environment when disabled', () => {
			debug.enable('save:*');
			debug.disable();
			assert.deepStrictEqual('DEBUG' in process.env, false);
			assert.deepStrictEqual(debug.load(), undefined);
		});
	});

	describe('instances', () => {
		it('gives each instance its own copy of inspectOpts', () => {
			debug.inspectOpts.depth = 3;
			try {
				const log = debug('init');
				assert.deepStrictEqual(log.inspectOpts.depth, 3);
				assert.notStrictEqual(log.inspectOpts, debug.inspectOpts);
				log.inspectOpts.depth = 9;
				assert.deepStrictEqual(debug.inspectOpts.depth, 3);
			} finally {
				delete debug.inspectOpts.depth;
			}
		});

		it('writes the formatted message and a newline to stderr', () => {
			const stub = sinon.stub(process.stderr, 'write');
			try {
				debug.log('%s and %d', 'text', 42);
			} finally {
				stub.restore();
			}
			assert.deepStrictEqual(stub.callCount, 1);
			assert.deepStrictEqual(stub.firstCall.args[0], 'text and 42\n');
		});

		it('keeps destroy() as a deprecated no-op', () => {
			const stub = sinon.stub(process, 'emitWarning');
			try {
				const log = debug('destroy');
				assert.doesNotThrow(() => log.destroy());
			} finally {
				stub.restore();
			}
		});
	});
});
