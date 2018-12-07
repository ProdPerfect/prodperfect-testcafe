'use strict';

exports.__esModule = true;

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _path = require('path');

var _commander = require('commander');

var _dedent = require('dedent');

var _dedent2 = _interopRequireDefault(_dedent);

var _readFileRelative = require('read-file-relative');

var _makeDir = require('make-dir');

var _makeDir2 = _interopRequireDefault(_makeDir);

var _runtime = require('../errors/runtime');

var _message = require('../errors/runtime/message');

var _message2 = _interopRequireDefault(_message);

var _typeAssertions = require('../errors/runtime/type-assertions');

var _getViewportWidth = require('../utils/get-viewport-width');

var _getViewportWidth2 = _interopRequireDefault(_getViewportWidth);

var _string = require('../utils/string');

var _lodash = require('lodash');

var _parseSslOptions = require('./parse-ssl-options');

var _parseSslOptions2 = _interopRequireDefault(_parseSslOptions);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const REMOTE_ALIAS_RE = /^remote(?::(\d*))?$/;

const DESCRIPTION = (0, _dedent2.default)(`
    In the browser list, you can use browser names (e.g. "ie", "chrome", etc.) as well as paths to executables.

    To run tests against all installed browsers, use the "all" alias.

    To use a remote browser connection (e.g., to connect a mobile device), specify "remote" as the browser alias.
    If you need to connect multiple devices, add a colon and the number of browsers you want to connect (e.g., "remote:3").

    To run tests in a browser accessed through a browser provider plugin, specify a browser alias that consists of two parts - the browser provider name prefix and the name of the browser itself; for example, "saucelabs:chrome@51".

    You can use one or more file paths or glob patterns to specify which tests to run.

    More info: https://devexpress.github.io/testcafe/documentation
`);

class CLIArgumentParser {
    constructor(cwd) {
        this.program = new _commander.Command('testcafe');

        this.cwd = cwd || process.cwd();

        this.src = null;
        this.browsers = null;
        this.filter = null;
        this.remoteCount = 0;
        this.opts = null;

        this._describeProgram();
    }

    static _parsePortNumber(value) {
        (0, _typeAssertions.assertType)(_typeAssertions.is.nonNegativeNumberString, null, 'Port number', value);

        return parseInt(value, 10);
    }

    static _optionValueToRegExp(name, value) {
        if (value === void 0) return value;

        try {
            return new RegExp(value);
        } catch (err) {
            throw new _runtime.GeneralError(_message2.default.optionValueIsNotValidRegExp, name);
        }
    }

    static _optionValueToKeyValue(name, value) {
        if (value === void 0) return value;

        const keyValue = value.split(',').reduce((obj, pair) => {
            var _pair$split = pair.split('=');

            const key = _pair$split[0],
                  val = _pair$split[1];


            if (!key || !val) throw new _runtime.GeneralError(_message2.default.optionValueIsNotValidKeyValue, name);

            obj[key] = val;
            return obj;
        }, {});

        if ((0, _keys2.default)(keyValue).length === 0) throw new _runtime.GeneralError(_message2.default.optionValueIsNotValidKeyValue, name);

        return keyValue;
    }

    static _getDescription() {
        // NOTE: add empty line to workaround commander-forced indentation on the first line.
        return '\n' + (0, _string.wordWrap)(DESCRIPTION, 2, (0, _getViewportWidth2.default)(process.stdout));
    }

    _describeProgram() {
        const version = JSON.parse((0, _readFileRelative.readSync)('../../package.json')).version;

        this.program.version(version, '-v, --version').usage('[options] <comma-separated-browser-list> <file-or-glob ...>').description(CLIArgumentParser._getDescription()).option('-b, --list-browsers [provider]', 'output the aliases for local browsers or browsers available through the specified browser provider').option('-r, --reporter <name[:outputFile][,...]>', 'specify the reporters and optionally files where reports are saved').option('-s, --screenshots <path>', 'enable screenshot capturing and specify the path to save the screenshots to').option('-S, --screenshots-on-fails', 'take a screenshot whenever a test fails').option('-p, --screenshot-path-pattern <pattern>', 'use patterns to compose screenshot file names and paths: ${BROWSER}, ${BROWSER_VERSION}, ${OS}, etc.').option('-q, --quarantine-mode', 'enable the quarantine mode').option('-d, --debug-mode', 'execute test steps one by one pausing the test after each step').option('-e, --skip-js-errors', 'make tests not fail when a JS error happens on a page').option('-u, --skip-uncaught-errors', 'ignore uncaught errors and unhandled promise rejections, which occur during test execution').option('-t, --test <name>', 'run only tests with the specified name').option('-T, --test-grep <pattern>', 'run only tests matching the specified pattern').option('-f, --fixture <name>', 'run only fixtures with the specified name').option('-F, --fixture-grep <pattern>', 'run only fixtures matching the specified pattern').option('-a, --app <command>', 'launch the tested app using the specified command before running tests').option('-c, --concurrency <number>', 'run tests concurrently').option('--test-meta <key=value[,key2=value2,...]>', 'run only tests with matching metadata').option('--fixture-meta <key=value[,key2=value2,...]>', 'run only fixtures with matching metadata').option('--debug-on-fail', 'pause the test if it fails').option('--app-init-delay <ms>', 'specify how much time it takes for the tested app to initialize').option('--selector-timeout <ms>', 'set the amount of time within which selectors make attempts to obtain a node to be returned').option('--assertion-timeout <ms>', 'set the amount of time within which assertion should pass').option('--page-load-timeout <ms>', 'set the amount of time within which TestCafe waits for the `window.load` event to fire on page load before proceeding to the next test action').option('--speed <factor>', 'set the speed of test execution (0.01 ... 1)').option('--ports <port1,port2>', 'specify custom port numbers').option('--hostname <name>', 'specify the hostname').option('--proxy <host>', 'specify the host of the proxy server').option('--proxy-bypass <rules>', 'specify a comma-separated list of rules that define URLs accessed bypassing the proxy server').option('--ssl <options>', 'specify SSL options to run TestCafe proxy server over the HTTPS protocol').option('--disable-page-reloads', 'disable page reloads between tests').option('--dev', 'enables mechanisms to log and diagnose errors').option('--qr-code', 'outputs QR-code that repeats URLs used to connect the remote browsers').option('--sf, --stop-on-first-fail', 'stop an entire test run if any test fails').option('--disable-test-syntax-validation', 'disables checks for \'test\' and \'fixture\' directives to run dynamically loaded tests').option('--record-screen-capture', 'take screenshots of each action')

        // NOTE: these options will be handled by chalk internally
        .option('--color', 'force colors in command line').option('--no-color', 'disable colors in command line');
    }

    _filterAndCountRemotes(browser) {
        const remoteMatch = browser.match(REMOTE_ALIAS_RE);

        if (remoteMatch) {
            this.remoteCount += parseInt(remoteMatch[1], 10) || 1;
            return false;
        }

        return true;
    }

    _parseFilteringOptions() {
        this.opts.testGrep = CLIArgumentParser._optionValueToRegExp('--test-grep', this.opts.testGrep);
        this.opts.fixtureGrep = CLIArgumentParser._optionValueToRegExp('--fixture-grep', this.opts.fixtureGrep);
        this.opts.testMeta = CLIArgumentParser._optionValueToKeyValue('--test-meta', this.opts.testMeta);
        this.opts.fixtureMeta = CLIArgumentParser._optionValueToKeyValue('--fixture-meta', this.opts.fixtureMeta);

        this.filter = (testName, fixtureName, fixturePath, testMeta, fixtureMeta) => {

            if (this.opts.test && testName !== this.opts.test) return false;

            if (this.opts.testGrep && !this.opts.testGrep.test(testName)) return false;

            if (this.opts.fixture && fixtureName !== this.opts.fixture) return false;

            if (this.opts.fixtureGrep && !this.opts.fixtureGrep.test(fixtureName)) return false;

            if (this.opts.testMeta && !(0, _lodash.isMatch)(testMeta, this.opts.testMeta)) return false;

            if (this.opts.fixtureMeta && !(0, _lodash.isMatch)(fixtureMeta, this.opts.fixtureMeta)) return false;

            return true;
        };
    }

    _parseAppInitDelay() {
        if (this.opts.appInitDelay) {
            (0, _typeAssertions.assertType)(_typeAssertions.is.nonNegativeNumberString, null, 'Tested app initialization delay', this.opts.appInitDelay);

            this.opts.appInitDelay = parseInt(this.opts.appInitDelay, 10);
        }
    }

    _parseSelectorTimeout() {
        if (this.opts.selectorTimeout) {
            (0, _typeAssertions.assertType)(_typeAssertions.is.nonNegativeNumberString, null, 'Selector timeout', this.opts.selectorTimeout);

            this.opts.selectorTimeout = parseInt(this.opts.selectorTimeout, 10);
        }
    }

    _parseAssertionTimeout() {
        if (this.opts.assertionTimeout) {
            (0, _typeAssertions.assertType)(_typeAssertions.is.nonNegativeNumberString, null, 'Assertion timeout', this.opts.assertionTimeout);

            this.opts.assertionTimeout = parseInt(this.opts.assertionTimeout, 10);
        }
    }

    _parsePageLoadTimeout() {
        if (this.opts.pageLoadTimeout) {
            (0, _typeAssertions.assertType)(_typeAssertions.is.nonNegativeNumberString, null, 'Page load timeout', this.opts.pageLoadTimeout);

            this.opts.pageLoadTimeout = parseInt(this.opts.pageLoadTimeout, 10);
        }
    }

    _parseSpeed() {
        if (this.opts.speed) this.opts.speed = parseFloat(this.opts.speed);
    }

    _parseConcurrency() {
        if (this.opts.concurrency) this.concurrency = parseInt(this.opts.concurrency, 10);
    }

    _parsePorts() {
        if (this.opts.ports) {
            this.opts.ports = this.opts.ports.split(',').map(CLIArgumentParser._parsePortNumber);

            if (this.opts.ports.length < 2) throw new _runtime.GeneralError(_message2.default.portsOptionRequiresTwoNumbers);
        }
    }

    _parseBrowserList() {
        const browsersArg = this.program.args[0] || '';

        this.browsers = (0, _string.splitQuotedText)(browsersArg, ',').filter(browser => browser && this._filterAndCountRemotes(browser));
    }

    _parseSslOptions() {
        if (this.opts.ssl) this.opts.ssl = (0, _parseSslOptions2.default)(this.opts.ssl);
    }

    _parseReporters() {
        var _this = this;

        return (0, _asyncToGenerator3.default)(function* () {
            if (!_this.opts.reporter) {
                _this.opts.reporters = [];
                return;
            }

            const reporters = _this.opts.reporter.split(',');

            _this.opts.reporters = reporters.map(function (reporter) {
                const separatorIndex = reporter.indexOf(':');

                if (separatorIndex < 0) return { name: reporter };

                const name = reporter.substring(0, separatorIndex);
                const outFile = reporter.substring(separatorIndex + 1);

                return { name, outFile };
            });

            for (var _iterator = _this.opts.reporters, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : (0, _getIterator3.default)(_iterator);;) {
                var _ref;

                if (_isArray) {
                    if (_i >= _iterator.length) break;
                    _ref = _iterator[_i++];
                } else {
                    _i = _iterator.next();
                    if (_i.done) break;
                    _ref = _i.value;
                }

                const reporter = _ref;

                if (reporter.outFile) {
                    reporter.outFile = (0, _path.resolve)(_this.cwd, reporter.outFile);

                    yield (0, _makeDir2.default)((0, _path.dirname)(reporter.outFile));
                }
            }
        })();
    }

    _parseFileList() {
        this.src = this.program.args.slice(1);
    }

    _getProviderName() {
        this.opts.providerName = this.opts.listBrowsers === true ? void 0 : this.opts.listBrowsers;
    }

    parse(argv) {
        var _this2 = this;

        return (0, _asyncToGenerator3.default)(function* () {
            _this2.program.parse(argv);

            _this2.opts = _this2.program.opts();

            // NOTE: the '-list-browsers' option only lists browsers and immediately exits the app.
            // Therefore, we don't need to process other arguments.
            if (_this2.opts.listBrowsers) {
                _this2._getProviderName();
                return;
            }

            _this2._parseFilteringOptions();
            _this2._parseSelectorTimeout();
            _this2._parseAssertionTimeout();
            _this2._parsePageLoadTimeout();
            _this2._parseAppInitDelay();
            _this2._parseSpeed();
            _this2._parsePorts();
            _this2._parseBrowserList();
            _this2._parseConcurrency();
            _this2._parseSslOptions();
            _this2._parseFileList();

            yield _this2._parseReporters();
        })();
    }
}
exports.default = CLIArgumentParser;
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;charset=utf8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jbGkvYXJndW1lbnQtcGFyc2VyLmpzIl0sIm5hbWVzIjpbIlJFTU9URV9BTElBU19SRSIsIkRFU0NSSVBUSU9OIiwiQ0xJQXJndW1lbnRQYXJzZXIiLCJjb25zdHJ1Y3RvciIsImN3ZCIsInByb2dyYW0iLCJDb21tYW5kIiwicHJvY2VzcyIsInNyYyIsImJyb3dzZXJzIiwiZmlsdGVyIiwicmVtb3RlQ291bnQiLCJvcHRzIiwiX2Rlc2NyaWJlUHJvZ3JhbSIsIl9wYXJzZVBvcnROdW1iZXIiLCJ2YWx1ZSIsImlzIiwibm9uTmVnYXRpdmVOdW1iZXJTdHJpbmciLCJwYXJzZUludCIsIl9vcHRpb25WYWx1ZVRvUmVnRXhwIiwibmFtZSIsIlJlZ0V4cCIsImVyciIsIkdlbmVyYWxFcnJvciIsIk1FU1NBR0UiLCJvcHRpb25WYWx1ZUlzTm90VmFsaWRSZWdFeHAiLCJfb3B0aW9uVmFsdWVUb0tleVZhbHVlIiwia2V5VmFsdWUiLCJzcGxpdCIsInJlZHVjZSIsIm9iaiIsInBhaXIiLCJrZXkiLCJ2YWwiLCJvcHRpb25WYWx1ZUlzTm90VmFsaWRLZXlWYWx1ZSIsImxlbmd0aCIsIl9nZXREZXNjcmlwdGlvbiIsInN0ZG91dCIsInZlcnNpb24iLCJKU09OIiwicGFyc2UiLCJ1c2FnZSIsImRlc2NyaXB0aW9uIiwib3B0aW9uIiwiX2ZpbHRlckFuZENvdW50UmVtb3RlcyIsImJyb3dzZXIiLCJyZW1vdGVNYXRjaCIsIm1hdGNoIiwiX3BhcnNlRmlsdGVyaW5nT3B0aW9ucyIsInRlc3RHcmVwIiwiZml4dHVyZUdyZXAiLCJ0ZXN0TWV0YSIsImZpeHR1cmVNZXRhIiwidGVzdE5hbWUiLCJmaXh0dXJlTmFtZSIsImZpeHR1cmVQYXRoIiwidGVzdCIsImZpeHR1cmUiLCJfcGFyc2VBcHBJbml0RGVsYXkiLCJhcHBJbml0RGVsYXkiLCJfcGFyc2VTZWxlY3RvclRpbWVvdXQiLCJzZWxlY3RvclRpbWVvdXQiLCJfcGFyc2VBc3NlcnRpb25UaW1lb3V0IiwiYXNzZXJ0aW9uVGltZW91dCIsIl9wYXJzZVBhZ2VMb2FkVGltZW91dCIsInBhZ2VMb2FkVGltZW91dCIsIl9wYXJzZVNwZWVkIiwic3BlZWQiLCJwYXJzZUZsb2F0IiwiX3BhcnNlQ29uY3VycmVuY3kiLCJjb25jdXJyZW5jeSIsIl9wYXJzZVBvcnRzIiwicG9ydHMiLCJtYXAiLCJwb3J0c09wdGlvblJlcXVpcmVzVHdvTnVtYmVycyIsIl9wYXJzZUJyb3dzZXJMaXN0IiwiYnJvd3NlcnNBcmciLCJhcmdzIiwiX3BhcnNlU3NsT3B0aW9ucyIsInNzbCIsIl9wYXJzZVJlcG9ydGVycyIsInJlcG9ydGVyIiwicmVwb3J0ZXJzIiwic2VwYXJhdG9ySW5kZXgiLCJpbmRleE9mIiwic3Vic3RyaW5nIiwib3V0RmlsZSIsIl9wYXJzZUZpbGVMaXN0Iiwic2xpY2UiLCJfZ2V0UHJvdmlkZXJOYW1lIiwicHJvdmlkZXJOYW1lIiwibGlzdEJyb3dzZXJzIiwiYXJndiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOzs7O0FBQ0E7O0FBQ0E7Ozs7QUFDQTs7QUFDQTs7OztBQUNBOztBQUNBOzs7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7OztBQUVBLE1BQU1BLGtCQUFrQixxQkFBeEI7O0FBRUEsTUFBTUMsY0FBYyxzQkFBUTs7Ozs7Ozs7Ozs7OztDQUFSLENBQXBCOztBQWVlLE1BQU1DLGlCQUFOLENBQXdCO0FBQ25DQyxnQkFBYUMsR0FBYixFQUFrQjtBQUNkLGFBQUtDLE9BQUwsR0FBZSxJQUFJQyxrQkFBSixDQUFZLFVBQVosQ0FBZjs7QUFFQSxhQUFLRixHQUFMLEdBQVdBLE9BQU9HLFFBQVFILEdBQVIsRUFBbEI7O0FBRUEsYUFBS0ksR0FBTCxHQUFtQixJQUFuQjtBQUNBLGFBQUtDLFFBQUwsR0FBbUIsSUFBbkI7QUFDQSxhQUFLQyxNQUFMLEdBQW1CLElBQW5CO0FBQ0EsYUFBS0MsV0FBTCxHQUFtQixDQUFuQjtBQUNBLGFBQUtDLElBQUwsR0FBbUIsSUFBbkI7O0FBRUEs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RUQsbUJBQUt6QyxzQkFBTDtBQUNBLG1CQUFLWSxxQkFBTDtBQUNBLG1CQUFLRSxzQkFBTDtBQUNBLG1CQUFLRSxxQkFBTDtBQUNBLG1CQUFLTixrQkFBTDtBQUNBLG1CQUFLUSxXQUFMO0FBQ0EsbUJBQUtLLFdBQUw7QUFDQSxtQkFBS0ksaUJBQUw7QUFDQSxtQkFBS04saUJBQUw7QUFDQSxtQkFBS1MsZ0JBQUw7QUFDQSxtQkFBS1MsY0FBTDs7QUFFQSxrQkFBTSxPQUFLUCxlQUFMLEVBQU47QUF4QmU7QUF5QmxCO0FBcFJrQztrQkFBbEI5RSxpQiIsImZpbGUiOiJjbGkvYXJndW1lbnQtcGFyc2VyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmVzb2x2ZSwgZGlybmFtZSB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJ2NvbW1hbmRlcic7XG5pbXBvcnQgZGVkZW50IGZyb20gJ2RlZGVudCc7XG5pbXBvcnQgeyByZWFkU3luYyBhcyByZWFkIH0gZnJvbSAncmVhZC1maWxlLXJlbGF0aXZlJztcbmltcG9ydCBtYWtlRGlyIGZyb20gJ21ha2UtZGlyJztcbmltcG9ydCB7IEdlbmVyYWxFcnJvciB9IGZyb20gJy4uL2Vycm9ycy9ydW50aW1lJztcbmltcG9ydCBNRVNTQUdFIGZyb20gJy4uL2Vycm9ycy9ydW50aW1lL21lc3NhZ2UnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSwgaXMgfSBmcm9tICcuLi9lcnJvcnMvcnVudGltZS90eXBlLWFzc2VydGlvbnMnO1xuaW1wb3J0IGdldFZpZXdQb3J0V2lkdGggZnJvbSAnLi4vdXRpbHMvZ2V0LXZpZXdwb3J0LXdpZHRoJztcbmltcG9ydCB7IHdvcmRXcmFwLCBzcGxpdFF1b3RlZFRleHQgfSBmcm9tICcuLi91dGlscy9zdHJpbmcnO1xuaW1wb3J0IHsgaXNNYXRjaCB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgcGFyc2VTc2xPcHRpb25zIGZyb20gJy4vcGFyc2Utc3NsLW9wdGlvbnMnO1xuXG5jb25zdCBSRU1PVEVfQUxJQVNfUkUgPSAvXnJlbW90ZSg/OjooXFxkKikpPyQvO1xuXG5jb25zdCBERVNDUklQVElPTiA9IGRlZGVudChgXG4gICAgSW4gdGhlIGJyb3dzZXIgbGlzdCwgeW91IGNhbiB1c2UgYnJvd3NlciBuYW1lcyAoZS5nLiBcImllXCIsIFwiY2hyb21lXCIsIGV0Yy4pIGFzIHdlbGwgYXMgcGF0aHMgdG8gZXhlY3V0YWJsZXMuXG5cbiAgICBUbyBydW4gdGVzdHMgYWdhaW5zdCBhbGwgaW5zdGFsbGVkIGJyb3dzZXJzLCB1c2UgdGhlIFwiYWxsXCIgYWxpYXMuXG5cbiAgICBUbyB1c2UgYSByZW1vdGUgYnJvd3NlciBjb25uZWN0aW9uIChlLmcuLCB0byBjb25uZWN0IGEgbW9iaWxlIGRldmljZSksIHNwZWNpZnkgXCJyZW1vdGVcIiBhcyB0aGUgYnJvd3NlciBhbGlhcy5cbiAgICBJZiB5b3UgbmVlZCB0byBjb25uZWN0IG11bHRpcGxlIGRldmljZXMsIGFkZCBhIGNvbG9uIGFuZCB0aGUgbnVtYmVyIG9mIGJyb3dzZXJzIHlvdSB3YW50IHRvIGNvbm5lY3QgKGUuZy4sIFwicmVtb3RlOjNcIikuXG5cbiAgICBUbyBydW4gdGVzdHMgaW4gYSBicm93c2VyIGFjY2Vzc2VkIHRocm91Z2ggYSBicm93c2VyIHByb3ZpZGVyIHBsdWdpbiwgc3BlY2lmeSBhIGJyb3dzZXIgYWxpYXMgdGhhdCBjb25zaXN0cyBvZiB0d28gcGFydHMgLSB0aGUgYnJvd3NlciBwcm92aWRlciBuYW1lIHByZWZpeCBhbmQgdGhlIG5hbWUgb2YgdGhlIGJyb3dzZXIgaXRzZWxmOyBmb3IgZXhhbXBsZSwgXCJzYXVjZWxhYnM6Y2hyb21lQDUxXCIuXG5cbiAgICBZb3UgY2FuIHVzZSBvbmUgb3IgbW9yZSBmaWxlIHBhdGhzIG9yIGdsb2IgcGF0dGVybnMgdG8gc3BlY2lmeSB3aGljaCB0ZXN0cyB0byBydW4uXG5cbiAgICBNb3JlIGluZm86IGh0dHBzOi8vZGV2ZXhwcmVzcy5naXRodWIuaW8vdGVzdGNhZmUvZG9jdW1lbnRhdGlvblxuYCk7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIENMSUFyZ3VtZW50UGFyc2VyIHtcbiAgICBjb25zdHJ1Y3RvciAoY3dkKSB7XG4gICAgICAgIHRoaXMucHJvZ3JhbSA9IG5ldyBDb21tYW5kKCd0ZXN0Y2FmZScpO1xuXG4gICAgICAgIHRoaXMuY3dkID0gY3dkIHx8IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAgICAgdGhpcy5zcmMgICAgICAgICA9IG51bGw7XG4gICAgICAgIHRoaXMuYnJvd3NlcnMgICAgPSBudWxsO1xuICAgICAgICB0aGlzLmZpbHRlciAgICAgID0gbnVsbDtcbiAgICAgICAgdGhpcy5yZW1vdGVDb3VudCA9IDA7XG4gICAgICAgIHRoaXMub3B0cyAgICAgICAgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuX2Rlc2NyaWJlUHJvZ3JhbSgpO1xuICAgIH1cblxuICAgIHN0YXRpYyBfcGFyc2VQb3J0TnVtYmVyICh2YWx1ZSkge1xuICAgICAgICBhc3NlcnRUeXBlKGlzLm5vbk5lZ2F0aXZlTnVtYmVyU3RyaW5nLCBudWxsLCAnUG9ydCBudW1iZXInLCB2YWx1ZSk7XG5cbiAgICAgICAgcmV0dXJuIHBhcnNlSW50KHZhbHVlLCAxMCk7XG4gICAgfVxuXG4gICAgc3RhdGljIF9vcHRpb25WYWx1ZVRvUmVnRXhwIChuYW1lLCB2YWx1ZSkge1xuICAgICAgICBpZiAodmFsdWUgPT09IHZvaWQgMClcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBSZWdFeHAodmFsdWUpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlcnIpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBHZW5lcmFsRXJyb3IoTUVTU0FHRS5vcHRpb25WYWx1ZUlzTm90VmFsaWRSZWdFeHAsIG5hbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhdGljIF9vcHRpb25WYWx1ZVRvS2V5VmFsdWUgKG5hbWUsIHZhbHVlKSB7XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKVxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuXG4gICAgICAgIGNvbnN0IGtleVZhbHVlID0gdmFsdWUuc3BsaXQoJywnKS5yZWR1Y2UoKG9iaiwgcGFpcikgPT4ge1xuICAgICAgICAgICAgY29uc3QgW2tleSwgdmFsXSA9IHBhaXIuc3BsaXQoJz0nKTtcblxuICAgICAgICAgICAgaWYgKCFrZXkgfHwgIXZhbClcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgR2VuZXJhbEVycm9yKE1FU1NBR0Uub3B0aW9uVmFsdWVJc05vdFZhbGlkS2V5VmFsdWUsIG5hbWUpO1xuXG4gICAgICAgICAgICBvYmpba2V5XSA9IHZhbDtcbiAgICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH0sIHt9KTtcblxuICAgICAgICBpZiAoT2JqZWN0LmtleXMoa2V5VmFsdWUpLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIHRocm93IG5ldyBHZW5lcmFsRXJyb3IoTUVTU0FHRS5vcHRpb25WYWx1ZUlzTm90VmFsaWRLZXlWYWx1ZSwgbmFtZSk7XG5cbiAgICAgICAgcmV0dXJuIGtleVZhbHVlO1xuICAgIH1cblxuICAgIHN0YXRpYyBfZ2V0RGVzY3JpcHRpb24gKCkge1xuICAgICAgICAvLyBOT1RFOiBhZGQgZW1wdHkgbGluZSB0byB3b3JrYXJvdW5kIGNvbW1hbmRlci1mb3JjZWQgaW5kZW50YXRpb24gb24gdGhlIGZpcnN0IGxpbmUuXG4gICAgICAgIHJldHVybiAnXFxuJyArIHdvcmRXcmFwKERFU0NSSVBUSU9OLCAyLCBnZXRWaWV3UG9ydFdpZHRoKHByb2Nlc3Muc3Rkb3V0KSk7XG4gICAgfVxuXG4gICAgX2Rlc2NyaWJlUHJvZ3JhbSAoKSB7XG4gICAgICAgIGNvbnN0IHZlcnNpb24gPSBKU09OLnBhcnNlKHJlYWQoJy4uLy4uL3BhY2thZ2UuanNvbicpKS52ZXJzaW9uO1xuXG4gICAgICAgIHRoaXMucHJvZ3JhbVxuXG4gICAgICAgICAgICAudmVyc2lvbih2ZXJzaW9uLCAnLXYsIC0tdmVyc2lvbicpXG4gICAgICAgICAgICAudXNhZ2UoJ1tvcHRpb25zXSA8Y29tbWEtc2VwYXJhdGVkLWJyb3dzZXItbGlzdD4gPGZpbGUtb3ItZ2xvYiAuLi4+JylcbiAgICAgICAgICAgIC5kZXNjcmlwdGlvbihDTElBcmd1bWVudFBhcnNlci5fZ2V0RGVzY3JpcHRpb24oKSlcblxuICAgICAgICAgICAgLm9wdGlvbignLWIsIC0tbGlzdC1icm93c2VycyBbcHJvdmlkZXJdJywgJ291dHB1dCB0aGUgYWxpYXNlcyBmb3IgbG9jYWwgYnJvd3NlcnMgb3IgYnJvd3NlcnMgYXZhaWxhYmxlIHRocm91Z2ggdGhlIHNwZWNpZmllZCBicm93c2VyIHByb3ZpZGVyJylcbiAgICAgICAgICAgIC5vcHRpb24oJy1yLCAtLXJlcG9ydGVyIDxuYW1lWzpvdXRwdXRGaWxlXVssLi4uXT4nLCAnc3BlY2lmeSB0aGUgcmVwb3J0ZXJzIGFuZCBvcHRpb25hbGx5IGZpbGVzIHdoZXJlIHJlcG9ydHMgYXJlIHNhdmVkJylcbiAgICAgICAgICAgIC5vcHRpb24oJy1zLCAtLXNjcmVlbnNob3RzIDxwYXRoPicsICdlbmFibGUgc2NyZWVuc2hvdCBjYXB0dXJpbmcgYW5kIHNwZWNpZnkgdGhlIHBhdGggdG8gc2F2ZSB0aGUgc2NyZWVuc2hvdHMgdG8nKVxuICAgICAgICAgICAgLm9wdGlvbignLVMsIC0tc2NyZWVuc2hvdHMtb24tZmFpbHMnLCAndGFrZSBhIHNjcmVlbnNob3Qgd2hlbmV2ZXIgYSB0ZXN0IGZhaWxzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy1wLCAtLXNjcmVlbnNob3QtcGF0aC1wYXR0ZXJuIDxwYXR0ZXJuPicsICd1c2UgcGF0dGVybnMgdG8gY29tcG9zZSBzY3JlZW5zaG90IGZpbGUgbmFtZXMgYW5kIHBhdGhzOiAke0JST1dTRVJ9LCAke0JST1dTRVJfVkVSU0lPTn0sICR7T1N9LCBldGMuJylcbiAgICAgICAgICAgIC5vcHRpb24oJy1xLCAtLXF1YXJhbnRpbmUtbW9kZScsICdlbmFibGUgdGhlIHF1YXJhbnRpbmUgbW9kZScpXG4gICAgICAgICAgICAub3B0aW9uKCctZCwgLS1kZWJ1Zy1tb2RlJywgJ2V4ZWN1dGUgdGVzdCBzdGVwcyBvbmUgYnkgb25lIHBhdXNpbmcgdGhlIHRlc3QgYWZ0ZXIgZWFjaCBzdGVwJylcbiAgICAgICAgICAgIC5vcHRpb24oJy1lLCAtLXNraXAtanMtZXJyb3JzJywgJ21ha2UgdGVzdHMgbm90IGZhaWwgd2hlbiBhIEpTIGVycm9yIGhhcHBlbnMgb24gYSBwYWdlJylcbiAgICAgICAgICAgIC5vcHRpb24oJy11LCAtLXNraXAtdW5jYXVnaHQtZXJyb3JzJywgJ2lnbm9yZSB1bmNhdWdodCBlcnJvcnMgYW5kIHVuaGFuZGxlZCBwcm9taXNlIHJlamVjdGlvbnMsIHdoaWNoIG9jY3VyIGR1cmluZyB0ZXN0IGV4ZWN1dGlvbicpXG4gICAgICAgICAgICAub3B0aW9uKCctdCwgLS10ZXN0IDxuYW1lPicsICdydW4gb25seSB0ZXN0cyB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZScpXG4gICAgICAgICAgICAub3B0aW9uKCctVCwgLS10ZXN0LWdyZXAgPHBhdHRlcm4+JywgJ3J1biBvbmx5IHRlc3RzIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgcGF0dGVybicpXG4gICAgICAgICAgICAub3B0aW9uKCctZiwgLS1maXh0dXJlIDxuYW1lPicsICdydW4gb25seSBmaXh0dXJlcyB3aXRoIHRoZSBzcGVjaWZpZWQgbmFtZScpXG4gICAgICAgICAgICAub3B0aW9uKCctRiwgLS1maXh0dXJlLWdyZXAgPHBhdHRlcm4+JywgJ3J1biBvbmx5IGZpeHR1cmVzIG1hdGNoaW5nIHRoZSBzcGVjaWZpZWQgcGF0dGVybicpXG4gICAgICAgICAgICAub3B0aW9uKCctYSwgLS1hcHAgPGNvbW1hbmQ+JywgJ2xhdW5jaCB0aGUgdGVzdGVkIGFwcCB1c2luZyB0aGUgc3BlY2lmaWVkIGNvbW1hbmQgYmVmb3JlIHJ1bm5pbmcgdGVzdHMnKVxuICAgICAgICAgICAgLm9wdGlvbignLWMsIC0tY29uY3VycmVuY3kgPG51bWJlcj4nLCAncnVuIHRlc3RzIGNvbmN1cnJlbnRseScpXG4gICAgICAgICAgICAub3B0aW9uKCctLXRlc3QtbWV0YSA8a2V5PXZhbHVlWyxrZXkyPXZhbHVlMiwuLi5dPicsICdydW4gb25seSB0ZXN0cyB3aXRoIG1hdGNoaW5nIG1ldGFkYXRhJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tZml4dHVyZS1tZXRhIDxrZXk9dmFsdWVbLGtleTI9dmFsdWUyLC4uLl0+JywgJ3J1biBvbmx5IGZpeHR1cmVzIHdpdGggbWF0Y2hpbmcgbWV0YWRhdGEnKVxuICAgICAgICAgICAgLm9wdGlvbignLS1kZWJ1Zy1vbi1mYWlsJywgJ3BhdXNlIHRoZSB0ZXN0IGlmIGl0IGZhaWxzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tYXBwLWluaXQtZGVsYXkgPG1zPicsICdzcGVjaWZ5IGhvdyBtdWNoIHRpbWUgaXQgdGFrZXMgZm9yIHRoZSB0ZXN0ZWQgYXBwIHRvIGluaXRpYWxpemUnKVxuICAgICAgICAgICAgLm9wdGlvbignLS1zZWxlY3Rvci10aW1lb3V0IDxtcz4nLCAnc2V0IHRoZSBhbW91bnQgb2YgdGltZSB3aXRoaW4gd2hpY2ggc2VsZWN0b3JzIG1ha2UgYXR0ZW1wdHMgdG8gb2J0YWluIGEgbm9kZSB0byBiZSByZXR1cm5lZCcpXG4gICAgICAgICAgICAub3B0aW9uKCctLWFzc2VydGlvbi10aW1lb3V0IDxtcz4nLCAnc2V0IHRoZSBhbW91bnQgb2YgdGltZSB3aXRoaW4gd2hpY2ggYXNzZXJ0aW9uIHNob3VsZCBwYXNzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tcGFnZS1sb2FkLXRpbWVvdXQgPG1zPicsICdzZXQgdGhlIGFtb3VudCBvZiB0aW1lIHdpdGhpbiB3aGljaCBUZXN0Q2FmZSB3YWl0cyBmb3IgdGhlIGB3aW5kb3cubG9hZGAgZXZlbnQgdG8gZmlyZSBvbiBwYWdlIGxvYWQgYmVmb3JlIHByb2NlZWRpbmcgdG8gdGhlIG5leHQgdGVzdCBhY3Rpb24nKVxuICAgICAgICAgICAgLm9wdGlvbignLS1zcGVlZCA8ZmFjdG9yPicsICdzZXQgdGhlIHNwZWVkIG9mIHRlc3QgZXhlY3V0aW9uICgwLjAxIC4uLiAxKScpXG4gICAgICAgICAgICAub3B0aW9uKCctLXBvcnRzIDxwb3J0MSxwb3J0Mj4nLCAnc3BlY2lmeSBjdXN0b20gcG9ydCBudW1iZXJzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0taG9zdG5hbWUgPG5hbWU+JywgJ3NwZWNpZnkgdGhlIGhvc3RuYW1lJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tcHJveHkgPGhvc3Q+JywgJ3NwZWNpZnkgdGhlIGhvc3Qgb2YgdGhlIHByb3h5IHNlcnZlcicpXG4gICAgICAgICAgICAub3B0aW9uKCctLXByb3h5LWJ5cGFzcyA8cnVsZXM+JywgJ3NwZWNpZnkgYSBjb21tYS1zZXBhcmF0ZWQgbGlzdCBvZiBydWxlcyB0aGF0IGRlZmluZSBVUkxzIGFjY2Vzc2VkIGJ5cGFzc2luZyB0aGUgcHJveHkgc2VydmVyJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tc3NsIDxvcHRpb25zPicsICdzcGVjaWZ5IFNTTCBvcHRpb25zIHRvIHJ1biBUZXN0Q2FmZSBwcm94eSBzZXJ2ZXIgb3ZlciB0aGUgSFRUUFMgcHJvdG9jb2wnKVxuICAgICAgICAgICAgLm9wdGlvbignLS1kaXNhYmxlLXBhZ2UtcmVsb2FkcycsICdkaXNhYmxlIHBhZ2UgcmVsb2FkcyBiZXR3ZWVuIHRlc3RzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tZGV2JywgJ2VuYWJsZXMgbWVjaGFuaXNtcyB0byBsb2cgYW5kIGRpYWdub3NlIGVycm9ycycpXG4gICAgICAgICAgICAub3B0aW9uKCctLXFyLWNvZGUnLCAnb3V0cHV0cyBRUi1jb2RlIHRoYXQgcmVwZWF0cyBVUkxzIHVzZWQgdG8gY29ubmVjdCB0aGUgcmVtb3RlIGJyb3dzZXJzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tc2YsIC0tc3RvcC1vbi1maXJzdC1mYWlsJywgJ3N0b3AgYW4gZW50aXJlIHRlc3QgcnVuIGlmIGFueSB0ZXN0IGZhaWxzJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tZGlzYWJsZS10ZXN0LXN5bnRheC12YWxpZGF0aW9uJywgJ2Rpc2FibGVzIGNoZWNrcyBmb3IgXFwndGVzdFxcJyBhbmQgXFwnZml4dHVyZVxcJyBkaXJlY3RpdmVzIHRvIHJ1biBkeW5hbWljYWxseSBsb2FkZWQgdGVzdHMnKVxuICAgICAgICAgICAgLm9wdGlvbignLS1yZWNvcmQtc2NyZWVuLWNhcHR1cmUnLCAndGFrZSBzY3JlZW5zaG90cyBvZiBlYWNoIGFjdGlvbicpXG5cblxuICAgICAgICAgICAgLy8gTk9URTogdGhlc2Ugb3B0aW9ucyB3aWxsIGJlIGhhbmRsZWQgYnkgY2hhbGsgaW50ZXJuYWxseVxuICAgICAgICAgICAgLm9wdGlvbignLS1jb2xvcicsICdmb3JjZSBjb2xvcnMgaW4gY29tbWFuZCBsaW5lJylcbiAgICAgICAgICAgIC5vcHRpb24oJy0tbm8tY29sb3InLCAnZGlzYWJsZSBjb2xvcnMgaW4gY29tbWFuZCBsaW5lJyk7XG4gICAgfVxuXG4gICAgX2ZpbHRlckFuZENvdW50UmVtb3RlcyAoYnJvd3Nlcikge1xuICAgICAgICBjb25zdCByZW1vdGVNYXRjaCA9IGJyb3dzZXIubWF0Y2goUkVNT1RFX0FMSUFTX1JFKTtcblxuICAgICAgICBpZiAocmVtb3RlTWF0Y2gpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3RlQ291bnQgKz0gcGFyc2VJbnQocmVtb3RlTWF0Y2hbMV0sIDEwKSB8fCAxO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgX3BhcnNlRmlsdGVyaW5nT3B0aW9ucyAoKSB7XG4gICAgICAgIHRoaXMub3B0cy50ZXN0R3JlcCAgICA9IENMSUFyZ3VtZW50UGFyc2VyLl9vcHRpb25WYWx1ZVRvUmVnRXhwKCctLXRlc3QtZ3JlcCcsIHRoaXMub3B0cy50ZXN0R3JlcCk7XG4gICAgICAgIHRoaXMub3B0cy5maXh0dXJlR3JlcCA9IENMSUFyZ3VtZW50UGFyc2VyLl9vcHRpb25WYWx1ZVRvUmVnRXhwKCctLWZpeHR1cmUtZ3JlcCcsIHRoaXMub3B0cy5maXh0dXJlR3JlcCk7XG4gICAgICAgIHRoaXMub3B0cy50ZXN0TWV0YSAgICA9IENMSUFyZ3VtZW50UGFyc2VyLl9vcHRpb25WYWx1ZVRvS2V5VmFsdWUoJy0tdGVzdC1tZXRhJywgdGhpcy5vcHRzLnRlc3RNZXRhKTtcbiAgICAgICAgdGhpcy5vcHRzLmZpeHR1cmVNZXRhID0gQ0xJQXJndW1lbnRQYXJzZXIuX29wdGlvblZhbHVlVG9LZXlWYWx1ZSgnLS1maXh0dXJlLW1ldGEnLCB0aGlzLm9wdHMuZml4dHVyZU1ldGEpO1xuXG4gICAgICAgIHRoaXMuZmlsdGVyID0gKHRlc3ROYW1lLCBmaXh0dXJlTmFtZSwgZml4dHVyZVBhdGgsIHRlc3RNZXRhLCBmaXh0dXJlTWV0YSkgPT4ge1xuXG4gICAgICAgICAgICBpZiAodGhpcy5vcHRzLnRlc3QgJiYgdGVzdE5hbWUgIT09IHRoaXMub3B0cy50ZXN0KVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMub3B0cy50ZXN0R3JlcCAmJiAhdGhpcy5vcHRzLnRlc3RHcmVwLnRlc3QodGVzdE5hbWUpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMub3B0cy5maXh0dXJlICYmIGZpeHR1cmVOYW1lICE9PSB0aGlzLm9wdHMuZml4dHVyZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdHMuZml4dHVyZUdyZXAgJiYgIXRoaXMub3B0cy5maXh0dXJlR3JlcC50ZXN0KGZpeHR1cmVOYW1lKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdHMudGVzdE1ldGEgJiYgIWlzTWF0Y2godGVzdE1ldGEsIHRoaXMub3B0cy50ZXN0TWV0YSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy5vcHRzLmZpeHR1cmVNZXRhICYmICFpc01hdGNoKGZpeHR1cmVNZXRhLCB0aGlzLm9wdHMuZml4dHVyZU1ldGEpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgX3BhcnNlQXBwSW5pdERlbGF5ICgpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0cy5hcHBJbml0RGVsYXkpIHtcbiAgICAgICAgICAgIGFzc2VydFR5cGUoaXMubm9uTmVnYXRpdmVOdW1iZXJTdHJpbmcsIG51bGwsICdUZXN0ZWQgYXBwIGluaXRpYWxpemF0aW9uIGRlbGF5JywgdGhpcy5vcHRzLmFwcEluaXREZWxheSk7XG5cbiAgICAgICAgICAgIHRoaXMub3B0cy5hcHBJbml0RGVsYXkgPSBwYXJzZUludCh0aGlzLm9wdHMuYXBwSW5pdERlbGF5LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfcGFyc2VTZWxlY3RvclRpbWVvdXQgKCkge1xuICAgICAgICBpZiAodGhpcy5vcHRzLnNlbGVjdG9yVGltZW91dCkge1xuICAgICAgICAgICAgYXNzZXJ0VHlwZShpcy5ub25OZWdhdGl2ZU51bWJlclN0cmluZywgbnVsbCwgJ1NlbGVjdG9yIHRpbWVvdXQnLCB0aGlzLm9wdHMuc2VsZWN0b3JUaW1lb3V0KTtcblxuICAgICAgICAgICAgdGhpcy5vcHRzLnNlbGVjdG9yVGltZW91dCA9IHBhcnNlSW50KHRoaXMub3B0cy5zZWxlY3RvclRpbWVvdXQsIDEwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9wYXJzZUFzc2VydGlvblRpbWVvdXQgKCkge1xuICAgICAgICBpZiAodGhpcy5vcHRzLmFzc2VydGlvblRpbWVvdXQpIHtcbiAgICAgICAgICAgIGFzc2VydFR5cGUoaXMubm9uTmVnYXRpdmVOdW1iZXJTdHJpbmcsIG51bGwsICdBc3NlcnRpb24gdGltZW91dCcsIHRoaXMub3B0cy5hc3NlcnRpb25UaW1lb3V0KTtcblxuICAgICAgICAgICAgdGhpcy5vcHRzLmFzc2VydGlvblRpbWVvdXQgPSBwYXJzZUludCh0aGlzLm9wdHMuYXNzZXJ0aW9uVGltZW91dCwgMTApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3BhcnNlUGFnZUxvYWRUaW1lb3V0ICgpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0cy5wYWdlTG9hZFRpbWVvdXQpIHtcbiAgICAgICAgICAgIGFzc2VydFR5cGUoaXMubm9uTmVnYXRpdmVOdW1iZXJTdHJpbmcsIG51bGwsICdQYWdlIGxvYWQgdGltZW91dCcsIHRoaXMub3B0cy5wYWdlTG9hZFRpbWVvdXQpO1xuXG4gICAgICAgICAgICB0aGlzLm9wdHMucGFnZUxvYWRUaW1lb3V0ID0gcGFyc2VJbnQodGhpcy5vcHRzLnBhZ2VMb2FkVGltZW91dCwgMTApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgX3BhcnNlU3BlZWQgKCkge1xuICAgICAgICBpZiAodGhpcy5vcHRzLnNwZWVkKVxuICAgICAgICAgICAgdGhpcy5vcHRzLnNwZWVkID0gcGFyc2VGbG9hdCh0aGlzLm9wdHMuc3BlZWQpO1xuICAgIH1cblxuICAgIF9wYXJzZUNvbmN1cnJlbmN5ICgpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0cy5jb25jdXJyZW5jeSlcbiAgICAgICAgICAgIHRoaXMuY29uY3VycmVuY3kgPSBwYXJzZUludCh0aGlzLm9wdHMuY29uY3VycmVuY3ksIDEwKTtcbiAgICB9XG5cbiAgICBfcGFyc2VQb3J0cyAoKSB7XG4gICAgICAgIGlmICh0aGlzLm9wdHMucG9ydHMpIHtcbiAgICAgICAgICAgIHRoaXMub3B0cy5wb3J0cyA9IHRoaXMub3B0cy5wb3J0c1xuICAgICAgICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgICAgICAgLm1hcChDTElBcmd1bWVudFBhcnNlci5fcGFyc2VQb3J0TnVtYmVyKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMub3B0cy5wb3J0cy5sZW5ndGggPCAyKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBHZW5lcmFsRXJyb3IoTUVTU0FHRS5wb3J0c09wdGlvblJlcXVpcmVzVHdvTnVtYmVycyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBfcGFyc2VCcm93c2VyTGlzdCAoKSB7XG4gICAgICAgIGNvbnN0IGJyb3dzZXJzQXJnID0gdGhpcy5wcm9ncmFtLmFyZ3NbMF0gfHwgJyc7XG5cbiAgICAgICAgdGhpcy5icm93c2VycyA9IHNwbGl0UXVvdGVkVGV4dChicm93c2Vyc0FyZywgJywnKVxuICAgICAgICAgICAgLmZpbHRlcihicm93c2VyID0+IGJyb3dzZXIgJiYgdGhpcy5fZmlsdGVyQW5kQ291bnRSZW1vdGVzKGJyb3dzZXIpKTtcbiAgICB9XG5cbiAgICBfcGFyc2VTc2xPcHRpb25zICgpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0cy5zc2wpXG4gICAgICAgICAgICB0aGlzLm9wdHMuc3NsID0gcGFyc2VTc2xPcHRpb25zKHRoaXMub3B0cy5zc2wpO1xuICAgIH1cblxuICAgIGFzeW5jIF9wYXJzZVJlcG9ydGVycyAoKSB7XG4gICAgICAgIGlmICghdGhpcy5vcHRzLnJlcG9ydGVyKSB7XG4gICAgICAgICAgICB0aGlzLm9wdHMucmVwb3J0ZXJzID0gW107XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXBvcnRlcnMgPSB0aGlzLm9wdHMucmVwb3J0ZXIuc3BsaXQoJywnKTtcblxuICAgICAgICB0aGlzLm9wdHMucmVwb3J0ZXJzID0gcmVwb3J0ZXJzLm1hcChyZXBvcnRlciA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXBhcmF0b3JJbmRleCA9IHJlcG9ydGVyLmluZGV4T2YoJzonKTtcblxuICAgICAgICAgICAgaWYgKHNlcGFyYXRvckluZGV4IDwgMClcbiAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lOiByZXBvcnRlciB9O1xuXG4gICAgICAgICAgICBjb25zdCBuYW1lICAgID0gcmVwb3J0ZXIuc3Vic3RyaW5nKDAsIHNlcGFyYXRvckluZGV4KTtcbiAgICAgICAgICAgIGNvbnN0IG91dEZpbGUgPSByZXBvcnRlci5zdWJzdHJpbmcoc2VwYXJhdG9ySW5kZXggKyAxKTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgbmFtZSwgb3V0RmlsZSB9O1xuICAgICAgICB9KTtcblxuICAgICAgICBmb3IgKGNvbnN0IHJlcG9ydGVyIG9mIHRoaXMub3B0cy5yZXBvcnRlcnMpIHtcbiAgICAgICAgICAgIGlmIChyZXBvcnRlci5vdXRGaWxlKSB7XG4gICAgICAgICAgICAgICAgcmVwb3J0ZXIub3V0RmlsZSA9IHJlc29sdmUodGhpcy5jd2QsIHJlcG9ydGVyLm91dEZpbGUpO1xuXG4gICAgICAgICAgICAgICAgYXdhaXQgbWFrZURpcihkaXJuYW1lKHJlcG9ydGVyLm91dEZpbGUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIF9wYXJzZUZpbGVMaXN0ICgpIHtcbiAgICAgICAgdGhpcy5zcmMgPSB0aGlzLnByb2dyYW0uYXJncy5zbGljZSgxKTtcbiAgICB9XG5cbiAgICBfZ2V0UHJvdmlkZXJOYW1lICgpIHtcbiAgICAgICAgdGhpcy5vcHRzLnByb3ZpZGVyTmFtZSA9IHRoaXMub3B0cy5saXN0QnJvd3NlcnMgPT09IHRydWUgPyB2b2lkIDAgOiB0aGlzLm9wdHMubGlzdEJyb3dzZXJzO1xuICAgIH1cblxuICAgIGFzeW5jIHBhcnNlIChhcmd2KSB7XG4gICAgICAgIHRoaXMucHJvZ3JhbS5wYXJzZShhcmd2KTtcblxuICAgICAgICB0aGlzLm9wdHMgPSB0aGlzLnByb2dyYW0ub3B0cygpO1xuXG4gICAgICAgIC8vIE5PVEU6IHRoZSAnLWxpc3QtYnJvd3NlcnMnIG9wdGlvbiBvbmx5IGxpc3RzIGJyb3dzZXJzIGFuZCBpbW1lZGlhdGVseSBleGl0cyB0aGUgYXBwLlxuICAgICAgICAvLyBUaGVyZWZvcmUsIHdlIGRvbid0IG5lZWQgdG8gcHJvY2VzcyBvdGhlciBhcmd1bWVudHMuXG4gICAgICAgIGlmICh0aGlzLm9wdHMubGlzdEJyb3dzZXJzKSB7XG4gICAgICAgICAgICB0aGlzLl9nZXRQcm92aWRlck5hbWUoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3BhcnNlRmlsdGVyaW5nT3B0aW9ucygpO1xuICAgICAgICB0aGlzLl9wYXJzZVNlbGVjdG9yVGltZW91dCgpO1xuICAgICAgICB0aGlzLl9wYXJzZUFzc2VydGlvblRpbWVvdXQoKTtcbiAgICAgICAgdGhpcy5fcGFyc2VQYWdlTG9hZFRpbWVvdXQoKTtcbiAgICAgICAgdGhpcy5fcGFyc2VBcHBJbml0RGVsYXkoKTtcbiAgICAgICAgdGhpcy5fcGFyc2VTcGVlZCgpO1xuICAgICAgICB0aGlzLl9wYXJzZVBvcnRzKCk7XG4gICAgICAgIHRoaXMuX3BhcnNlQnJvd3Nlckxpc3QoKTtcbiAgICAgICAgdGhpcy5fcGFyc2VDb25jdXJyZW5jeSgpO1xuICAgICAgICB0aGlzLl9wYXJzZVNzbE9wdGlvbnMoKTtcbiAgICAgICAgdGhpcy5fcGFyc2VGaWxlTGlzdCgpO1xuXG4gICAgICAgIGF3YWl0IHRoaXMuX3BhcnNlUmVwb3J0ZXJzKCk7XG4gICAgfVxufVxuIl19
