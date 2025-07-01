const {assert} = require('chai');
const Grid = require('../lib/grid.js');
const {setupServer, asyncEach, selectByValue, radioByValue, checkboxByValue, sleep, clearTextInput} = require('../lib/util.js');

const {Builder, By, Key} = require('selenium-webdriver');
const {Preferences: LoggingPrefs, Type: LoggingType, Level: LoggingLevel} = require('selenium-webdriver/lib/logging');

describe('Source Parameters', function () {
	setupServer();
	const logging = new LoggingPrefs();
	logging.setLevel(LoggingType.BROWSER, LoggingLevel.ALL);
	let driver;
	let grid;

	before(function () {
		driver = new Builder().forBrowser('chrome').setLoggingPrefs(logging).build();
	});

	after(async function () {
		if (driver != null) {
			await driver.quit();
		}
	});

	function befores(url) {
		before(async function () {
			await driver.get(url);
			grid = new Grid(driver);
			await grid.waitForIdle();
		});
	}

	function afters() {
		after(async function () {
			await driver.executeScript('window.localStorage.clear()');
		});
	}

	function commonTests() {
		describe('changes when you update <input type="text">', function () {
			it ('and make it empty', async function () {
				let input = await driver.findElement(By.css('input[name="text"]'));
				await input.clear();
				await grid.refresh();
				await grid.waitForIdle();
				let actual = (await grid.getPlainData_asArrays()).map(item => item[0]);
				// assert.notInclude(actual, 'text');
			});

			it('and put something in it', async function () {
				let input = await driver.findElement(By.css('input[name="text"]'));
				await input.clear();
				await input.sendKeys('gojira');
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['text', 'gojira']);
			});
		});

		describe('changes when you update <input type="checkbox">', function () {
			it ('and leave all unchecked', async function () {
				let inputs = await driver.findElements(By.css('input[name="checkbox"]'));
				await checkboxByValue(inputs);
				await grid.refresh();
				await grid.waitForIdle();
				// The parameter should not be sent, so it should not show up in response.
				let actual = (await grid.getPlainData_asArrays()).map(item => item[0]);
				assert.notInclude(actual, 'checkbox');
			});

			it('and check one', async function () {
				let inputs = await driver.findElements(By.css('input[name="checkbox"]'));
				await checkboxByValue(inputs, ['ham']);
				await grid.refresh();
				await grid.waitForIdle();
				// The parameter should be sent, so it should be in the response.
				let data = await grid.getPlainData_asArrays();
				assert.include(data.map(item => item[0]), 'checkbox');
				// The parameter should have a single value.
				let checkboxData = data.find(item => item[0] === 'checkbox')[1].split(',');
				assert.deepEqual(checkboxData, ['ham']);
			});

			it('and check multiple', async function () {
				let inputs = await driver.findElements(By.css('input[name="checkbox"]'));
				await checkboxByValue(inputs, ['ham', 'pineapple']);
				await grid.refresh();
				await grid.waitForIdle();
				// The parameter should be sent, so it should be in the response.
				let data = await grid.getPlainData_asArrays();
				assert.include(data.map(item => item[0]), 'checkbox');
				// The parameter should have multiple values.
				let checkboxData = data.find(item => item[0] === 'checkbox')[1].split(',');
				assert.include(checkboxData, 'ham');
				assert.include(checkboxData, 'pineapple');
			});
		});

		describe('changes when you update <input type="radio">', function () {
			it('and just change the value', async function () {
				let input = await driver.findElements(By.css('input[name="radio"]'));
				await radioByValue(input, 'pan');
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['radio', 'pan']);
			});
		});

		describe('changes when you update <select>', function () {
			it ('and just change the value', async function () {
				let input = await driver.findElement(By.css('select[name="select"]'));
				await selectByValue(input, 'red');
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['select', 'red']);
			});
		});

		describe('changes when you update <textarea>', function () {
			it ('and make it empty', async function () {
				let input = await driver.findElement(By.css('textarea[name="textarea"]'));
				await input.clear();
				await grid.refresh();
				await grid.waitForIdle();
				let actual = (await grid.getPlainData_asArrays()).map(item => item[0]);
				assert.notInclude(actual, 'textarea');
			});

			it('and put something in it', async function () {
				let input = await driver.findElement(By.css('textarea[name="textarea"]'));
				await input.clear();
				await input.sendKeys('valley of the kings');
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['textarea', 'valley of the kings']);
			});
		});
	}

	describe('using individual inputs', function () {
		befores('http://localhost:3000/grid/sourceParams/form.html');
		afters();
		it('shows initial values of all form elements', async function () {
			let actual = await grid.getPlainData_asArrays();
			let expected = [
				['checkbox', 'pepperoni,mushrooms'],
				['groupOutput', 'detail'],
				['hidden', 'hidden'],
				['select', 'black'],
				['text', 'test'],
				['textarea', 'hello frendo'],
			];
			assert.deepEqual(actual, expected);
		});
		commonTests();
	});

	describe('using the whole form', function () {
		befores('http://localhost:3000/grid/sourceParams/inputs.html');
		afters();
		it('shows initial values of specified inputs', async function () {
			let actual = await grid.getPlainData_asArrays();
			let expected = [
				['checkbox', 'pepperoni,mushrooms'],
				['hidden', 'hidden'],
				['select', 'black'],
				['text', 'test'],
				['textarea', 'hello frendo'],
				['toggle-checkbox', 'off'],
			];
			assert.deepEqual(actual, expected);
		});
		commonTests();
		describe('changes when you update <input type="checkbox"> as a toggle', function () {
			it ('and check it', async function () {
				let input = await driver.findElement(By.css('input[name="toggle-checkbox"]:not(:checked)'));
				await input.click();
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['toggle-checkbox', 'on']);
			});
			it ('and uncheck it', async function () {
				let input = await driver.findElement(By.css('input[name="toggle-checkbox"]:checked'));
				await input.click();
				await grid.refresh();
				await grid.waitForIdle();
				assert.deepInclude(await grid.getPlainData_asArrays(), ['toggle-checkbox', 'off']);
			});
		});
	});
});
