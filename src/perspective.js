// Imports {{{1

import sprintf from 'sprintf-js';
import numeral from 'numeral';

import {
	asyncEach,
	deepCopy,
	deepDefaults,
	getProp,
	getPropDef,
	I,
	log,
	makeSubclass,
	mixinDebugging,
	mixinEventHandling,
	mixinLogging,
	setProp,
	uuid,
	walkObj,
} from './util/misc.js';

import OrdMap from './util/ordmap.js';
import Lock from './util/lock.js';

import { Grid } from './grid.js';
import { Graph } from './graph.js';

import { PREFS_BACKEND_REGISTRY } from './prefs_backend.js';
import { PREFS_MODULE_REGISTRY } from './prefs_module.js';

/**
 * @file
 * This file contains the implementation of the prefs system.
 *
 * ## Terminology
 *
 * - **Perspective**:
 *
 * - **Prefs Module**:
 *
 * - **Prefs Backend**:
 *
 * - **Prime**: Prepare the prefs system for interactive use.  See {@link Prefs#prime}.
 *
 * - **Reset**:
 *
 * ## Responsibilities
 *
 * - Take configuration from bound components and store it in a backend.
 * - Retrieve configuration from a backend and load it into bound components.
 * - Allow management of perspectives, e.g. create new, rename, and delete.
 * - Facilitate switching between perspectives, including via history stack.
 *
 * ## Classes
 *
 * - {@link Prefs}
 * - {@link PrefsBackend}
 *   - {@link PrefsBackendLocalStorage}
 *   - {@link PrefsBackendTemporary}
 * - {@link PrefsModule}
 *   - {@link PrefsModuleComputedView}
 *   - {@link PrefsModuleMirageView}
 *   - {@link PrefsModuleGrid}
 *   - {@link PrefsModuleGraph}
 */

// Perspective {{{1

// Constructor {{{2

/**
 * Create a perspective.
 *
 * @param {string} [id=uuid()]
 * The ID of the perspective.  If not provided, creates a new UUID for it.
 *
 * @param {string} name
 * The name of the perspective; this is what's shown in the user interface.
 *
 * @param {object} config
 *
 * @param {Object.<string,PrefsModule>} modules
 *
 * @param {object} [opts]
 *
 * @param {boolean} [opts.isTemporary=false]
 * If true, then the perspective will not be saved automatically, but it can be made permanent.
 *
 * @param {boolean} [opts.isEssential=false]
 * If true, then the perspective cannot be renamed or deleted.  A reset will not remove it.
 *
 * @param {boolean} [opts.isConstant=false]
 * If true, then the perspective will not be saved if it has been changed.
 *
 * @class
 *
 * @property {string} id See above.
 * @property {object} config See above.
 * @property {Object.<string,PrefsModule>} modules See above.
 * @property {object} opts See above.
 *
 * @property {boolean} isUnsaved
 * If true, then the perspective has been changed and needs to be saved.
 */

var Perspective = makeSubclass('Perspective', Object, function (id, name, config, modules, opts) {
	var self = this;

	if (id != null && typeof id !== 'string') {
		throw new Error('Call Error: `id` must be null or a string')
	}
	if (name != null && typeof name !== 'string') {
		throw new Error('Call Error: `name` must be null or a string');
	}

	if (id == null) {
		id = uuid();
	}

	if (name == null) {
		name = id;
	}

	self.id = id;
	self.name = name;
	self.config = config;
	self.modules = modules;
	self.isUnsaved = false;
	self.opts = deepDefaults(opts, {
		isEssential: false,
		isTemporary: false,
		isConstant: false
	});

	/*
	// Unversioned perspectives are called version 1.
	// The first properly versioned perspective object is called version 2.
	if (self.config.version == null) {
		self.config.version = 1;
	}

	for (var v = 1; v <= self.CURRENT_VERSION; v += 1) {
		switch (v) {
		case 2:
			// Renamed the "view" module to "computed_view".
			self.config.computed_view = self.config.view;
			delete self.config.view;
			break;
		// Add new perspective object version migration here.
		default:
			self.logError('UPGRADE VERSION', 'No way to upgrade from v' + self.config.version + ' to v' + v);
		}
	}

	self.config.version = v - 1;
	*/
}, {
	CURRENT_VERSION: 2
});

mixinDebugging(Perspective, function () {
	return sprintf.sprintf('PREFS // PERSPECTIVE (%s)', this.id);
});

mixinLogging(Perspective);

// #load {{{2

/**
 * Push the configuration of this perspective to all bound modules.
 *
 * @param {function} [cont]
 */

Perspective.prototype.load = function (moduleNames, cont) {
	var self = this;

	if (cont != null && typeof cont !== 'function') {
		throw new Error('Call Error: `cont` must be null or a function');
	}

	cont = cont || I;

	if (moduleNames == null) {
		moduleNames = Object.keys(self.modules);
	}

	self.debug(null, 'Loading perspective using these modules: %s', JSON.stringify(moduleNames));

	// Go through every module that we have preferences for and load them into the bound components.

	moduleNames.forEach(function (moduleName) {
		var m = self.modules[moduleName];
		var c = self.config[moduleName];
		if (c == null && m.defaultConfig != null) {
			self.debug(null, 'Using default config for module: moduleName = %s ; config = %O', moduleName, m.defaultConfig);
			c = m.defaultConfig;
		}
		self.debug(null, 'Loading module: moduleName = %s ; config = %O', moduleName, c);
		m.load(c);
	});

	return cont(true);
};

// #save {{{2

/**
 * Receive configuration from all bound modules and update this perspective's configuration.
 *
 * @param {function} [cont]
 */

Perspective.prototype.save = function (cont) {
	var self = this;

	if (cont != null && typeof cont !== 'function') {
		throw new Error('Call Error: `cont` must be null or a function');
	}

	cont = cont || I;

	self.debug(null, 'Saving perspective');

	// Go through every module that we have preferences for and save them from the bound components.

	Object.keys(self.modules).forEach(function (moduleName) {
		var module = self.modules[moduleName];
		self.config[moduleName] = module.save();
		self.debug(null, 'Saving module: moduleName = %s ; config = %O', moduleName, self.config[moduleName]);
	});

	return cont(self.config);
};

// #isMirage {{{2

/**
 * Indicates if the Perspective configures the results of mirage data.
 *
 * If false, then the perspective configures live data processed from a Source via a ComputedView.
 * If true, then the perspective configures static data processed from a MirageSource via a
 * MirageView.  The main reasons we have this flag are:
 *
 *   - so code handling the `perspectiveChanged` event can switch from a ComputedView to a
 *     MirageView or vice versa on their Renderer
 *   - so we can trim out and only save applicable modules, e.g. the ViewModule doesn't need to be
 *     saved when we're not processing live data
 *
 * @return {boolean}
 */

Perspective.prototype.isMirage = function () {
	var self = this;

	return self.config.isMirage;
};

// #getVersion {{{2

/**
 * Tells what version this perspective object is on.  Used to migrate the details of perspective
 * storage from one version to another in case there are changes to the format over time.
 *
 * @return {number}
 */

Perspective.prototype.getVersion = function () {
	var self = this;

	return self.config.version;
};

// Exports {{{1

export {
	Perspective,
};
