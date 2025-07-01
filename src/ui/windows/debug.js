import JSONFormatter from 'json-formatter-js';

import OrdMap from '../../util/ordmap.js';

import jQuery from 'jquery';

import {
	each,
	fontAwesome,
	getPropDef,
	makeSubclass,
	moveArrayElement,
} from '../../util/misc.js';

// DebugWin {{{1

var DebugWin = makeSubclass('DebugWin', Object, function () {
	var self = this;
});

// #show {{{2

DebugWin.prototype.show = function (grid, view, source) {
	var self = this;

	var winEffect = {
		effect: 'fade',
		duration: 100
	};

	var win = jQuery('<div>', { id: 'wcdv_debugwin', title: 'Debug Info' }).css({
		'display': 'flex',
		'flex-direction': 'column'
	}).dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		maxHeight: 600,
		position: {
			my: 'center',
			at: 'top',
			of: window
		},
		classes: {
			"ui-dialog": "ui-corner-all wcdv_dialog",
			"ui-dialog-titlebar": "ui-corner-all",
		},
		show: winEffect,
		hide: winEffect,
		close: function () {
			win.dialog('destroy');
		}
	});

	var tabs = [{
		name: 'Source',
		id: 'sourceTab',
		items: [{
			name: 'Configuration',
			elt: (function () {
				var info = new OrdMap();
				info.set('Source type', source.type);
				info.set('Source name', source.name);
				info.set('Source spec', source.origin.spec);
				return jQuery('<div>')
					.append(info.asHtmlDefnList());
			})()
		}, {
			name: 'Params',
			elt: jQuery('<div>')
				.append(new JSONFormatter(source.params, 0).render())
		}, {
			name: 'Type Info',
			elt: jQuery('<div>')
				.append(new JSONFormatter(source.cache.typeInfo.asMap(), 0).render())
		}]
	}, {
		name: 'View',
		id: 'viewTab',
		items: [{
			name: 'Current Config',
			elt: (function () {
				var info = new OrdMap();
				info.set('View name', view.name);
				info.set('Filter config', view.getFilter());
				info.set('Group config', view.getGroup());
				info.set('Pivot config', view.getPivot());
				info.set('Aggregate config', view.getAggregate());
				return jQuery('<div>')
					.append(info.asHtmlDefnList());
			})()
		}]
	}, {
		name: 'Grid',
		id: 'gridTab',
		items: [{
			name: 'Columns',
			elt: jQuery('<div>')
				.append(new JSONFormatter(grid.colConfig.asMap(), 0).render())
		}]
	}, {
		name: 'Prefs',
		id: 'prefsTab',
		items: [{
			name: 'Configuration',
			elt: (function () {
				var info = new OrdMap();
				info.set('Auto-Save', grid.prefs.opts.autoSave);
				info.set('Backend Type', grid.prefs.opts.backend.type);
				info.set('Current Perspective', jQuery('<span>' + grid.prefs.currentPerspective.id + '<br/><i>' + grid.prefs.currentPerspective.name + '</i></span>'));
				info.set('Bardo', grid.prefs.bardo);
				return jQuery('<div>')
					.append(info.asHtmlDefnList());
			})()
		}, {
			name: 'Perspectives',
			elt: (function () {
				var info = new OrdMap();
				each(grid.prefs.perspectives, function (p) {
					info.set(p.id, {
						'Name': p.name,
						'Config': p.config,
						'Status': p.isUnsaved ? 'Modified' : 'Saved'
					});
				});
				return jQuery('<div>')
					.append(info.asHtmlDefnList());
			})()
		}]
	}];

	var tabsList = jQuery('<ul>').css({
		'flex-grow': '0',
		'flex-shrink': '0',
		'flex-basis': 'auto'
	});
	each(tabs, function (t) {
		var tabAnchor = jQuery('<a>', { href: '#' + t.id }).text(t.name);
		tabsList.append(jQuery('<li>').append(tabAnchor));
	});

	var tabsDiv = jQuery('<div>').css({
		'flex': 'auto',
		'overflow': 'hidden',
		'display': 'flex',
		'flex-direction': 'column'
	})
		.append(tabsList);
	each(tabs, function (t) {
		var container = jQuery('<div>', {id: t.id}).css({
			'flex-grow': '1',
			'flex-shrink': '1',
			'flex-basis': 'auto',
			'overflow': 'scroll'
		});
		each(t.items, function (ti) {
			container.append(jQuery('<h3>').text(ti.name));
			container.append(ti.elt);
		});
		container.accordion({
			heightStyle: "content"
		});
		tabsDiv.append(container);
	});
	tabsDiv.appendTo(win).tabs();

	var buttonBar = jQuery('<div>').css({
		'flex-grow': '0',
		'flex-shrink': '0',
		'flex-basis': 'auto',
		'padding-top': '2ex'
	})
		.addClass('wcdv_button_bar')
		.appendTo(win);

	var words = ['Very Cool', 'Thanks', 'Nice!', 'All Right', 'Whatever'];
	jQuery('<button>', {
		'type': 'button',
		'class': '',
		'title': 'Very Cool'
	})
		.append(fontAwesome('fa-thumbs-up'))
		.append(words[Math.floor(Math.random() * words.length)])
		.on('click', function () {
			win.dialog('close');
		})
		.appendTo(buttonBar);

	win.dialog('open');
};

export {
	DebugWin
};
