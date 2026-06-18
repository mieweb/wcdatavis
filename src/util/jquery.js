import jQuery from 'jquery';
import _ from 'underscore';

import { trans } from '../trans.js';

import {
	deepDefaults,
	fontAwesome,
	getProp,
} from './misc.js';
import flags from '../flags.js';

/**
 * The jQuery plugin namespace.
 * @external "jQuery.fn"
 * @see {@link http://learn.jquery.com/plugins/|jQuery Plugins}
 */

jQuery.fn.extend({

	/**
	 * Tells whether the element is checked.
	 *
	 * @function external:"jQuery.fn"#_isChecked
	 *
	 * @returns {boolean}
	 * True if the element is checked, false if it's not.
	 */

	_isChecked: function () {
		return this.prop('checked');
	},

	/**
	 * Checks a checkbox.
	 *
	 * @function external:"jQuery.fn"#_check
	 *
	 * @returns {boolean}
	 * True if the element is now checked, false if it's not.
	 */

	_check: function () {
		this.prop('checked', true);
	},

	/**
	 * Unchecks a checkbox.
	 *
	 * @function external:"jQuery.fn"#_uncheck
	 */

	_uncheck: function () {
		this.prop('checked', false);
	},

	/**
	 * Toggles the checkbox.
	 *
	 * @function external:"jQuery.fn"#_toggleCheck
	 *
	 * @returns {boolean}
	 * True if the element is now checked, false if it's not.
	 */

	_toggleCheck: function () {
		var newValue = !this.prop('checked');
		this.prop('checked', newValue);
		return newValue;
	},

	/**
	 * Tells whether the element is disabled.
	 *
	 * @function external:"jQuery.fn"#_isDisabled
	 *
	 * @returns {boolean}
	 * True if the element is disabled, false if it's not.
	 */

	_isDisabled: function () {
		return this.attr('disabled');
	},

	/**
	 * Tells whether the element is hidden.
	 *
	 * @function external:"jQuery.fn"#_isHidden
	 *
	 * @returns {boolean}
	 * True if the element is hidden, false if it's visible.
	 */

	_isHidden: function () {
		return this.css('display') === 'none' || this.css('visibility') !== 'visible';
	},

	/**
	 * Ensures that an element ends with certain text.
	 *
	 * @function external:"jQuery.fn"#_addTrailing
	 *
	 * @param {string} chars
	 * The text that will be added to the end of this element, if necessary.
	 */

	_addTrailing: function (chars) {
		var t = this.text();
		if (t.slice(chars.length * -1) !== chars){
			this.text(t + chars);
		}
	},

	/**
	 * Ensures that an element does not end with certain text.
	 *
	 * @function external:"jQuery.fn"#_stripTrailing
	 *
	 * @param {string} chars
	 * The text that will be removed from this element's text, if necessary.
	 */

	_stripTrailing: function (chars) {
		var t = this.text();
		if (t.slice(chars.length * -1) === chars) {
			this.text(t.slice(0, chars.length * -1));
		}
	},

	/**
	 * Make a checkbox that is represented by an icon.  The icon can change based on whether the
	 * checkbox is on/off (e.g. turning from a "check" icon to an "x" icon).  Or the icon can be
	 * displayed with a different class (e.g. to change the background or color when on/off).
	 *
	 * @function external:"jQuery.fn"#_makeIconCheckbox
	 *
	 * @example
	 * _makeIconCheckbox('foo') -->
	 *   off = fontawesome('foo'), class = 'wcdv_icon_checkbox_off'
	 *   on = fontawesome('foo'), class = 'wcdv_icon_checkbox_on'
	 * _makeIconCheckbox('foo', 'bar') -->
	 *   off = fontawesome('foo')
	 *   on = fontawesome('bar')
	 * _makeIconCheckbox(obj) -->
	 *   off = fontawesome(obj.off.icon), class = obj.off.classes
	 *   on = fontawesome(obj.on.icon), class = obj.on.classes
	 */

	_makeIconCheckbox: (function () {
		var id = 0;

		return function () {
			var self = this
				, args = Array.prototype.slice.call(arguments)
				, opts = {};

			if (args.length === 1) {
				if (typeof args[0] === 'string') {
					opts = {
						on: {
							icon: args[0],
							classes: 'wcdv_icon_checkbox_on'
						},
						off: {
							icon: args[0],
							classes: 'wcdv_icon_checkbox_off'
						}
					};
				}
				else {
					opts = args[0];
				}
			}
			else if (args.length === 2) {
				opts = {
					on: {
						icon: args[0]
					},
					off: {
						icon: args[1]
					}
				};
			}

			// IDs are needed to find FontAwesome SVG icons.

			opts.on.id = 'wcdv-icon-checkbox-' + (id++);
			opts.off.id = 'wcdv-icon-checkbox-' + (id++);

			var button = jQuery('<button>', {
				'type': 'button',
				'disabled': jQuery(self).prop('disabled'),
				'title': self.attr('title'),
				'aria-label': self.attr('title')
			})
				.addClass('wcdv_icon_button wcdv_button_left')
				.on('click', function () {
					self._toggleCheck();
					self.trigger('change');
				})
			;

			var onIcon = fontAwesome(opts.on.icon, opts.on.classes)
				.attr({id: opts.on.id})
				.css('display', 'inline-block')
				.hide()
				.appendTo(button);
			var offIcon = fontAwesome(opts.off.icon, opts.off.classes)
				.attr({id: opts.off.id})
				.css('display', 'inline-block')
				.hide()
				.appendTo(button);

			var updateIcon = function () {
				if (self._isChecked()) {
					if (flags['FontAwesome Method'] === 'svg') {
						jQuery(document.getElementById(opts.on.id)).show();
						jQuery(document.getElementById(opts.off.id)).hide();
					}
					else {
						onIcon.show();
						offIcon.hide();
					}
					if (opts.on.tooltip != null) {
						button.attr('title', opts.on.tooltip);
					}
				}
				else {
					if (flags['FontAwesome Method'] === 'svg') {
						jQuery(document.getElementById(opts.on.id)).hide();
						jQuery(document.getElementById(opts.off.id)).show();
					}
					else {
						onIcon.hide();
						offIcon.show();
					}
					if (opts.off.tooltip != null) {
						button.attr('title', opts.off.tooltip);
					}
				}
			};

			if (flags['FontAwesome Method'] === 'svg') {
				// Give FontAwesome a chance to replace the elements we made with SVG versions.
				window.setTimeout(updateIcon);
			}
			else {
				updateIcon();
			}
			self.hide();
			self.before(button);
			self.on('change', updateIcon);
			self._updateIcon = updateIcon;

			return self;
		};
	})(),

	/**
	 * Adds debugging output for jQuery UI behavior events.
	 *
	 * @function external:"jQuery.fn"#_addEventDebugging
	 *
	 * @param {string} what
	 * The behavior to output debugging info for.  Must be: drag, drop, or sort.
	 *
	 * @param {string} tag
	 * Prefix to output at the beginning of the debug message.
	 */

	_addEventDebugging: function (what, tag) {
		var elt = this;
		switch (what) {
		case 'drag':
			elt.on('dragstart', function (evt, ui) {
				console.log('### ' + tag + ' > DRAG.START: evt = %O, ui = %O', evt, ui);
			});
			elt.on('dragstop', function (evt, ui) {
				console.log('### ' + tag + ' > DRAG.STOP: evt = %O, ui = %O', evt, ui);
			})
			break;
		case 'drop':
			elt.on('dropactivate', function (evt, ui) {
				console.log('### ' + tag + ' > DROP.ACTIVATE: evt = %O, ui = %O', evt, ui);
			});
			elt.on('dropdeactivate', function (evt, ui) {
				console.log('### ' + tag + ' > DROP.DEACTIVATE: evt = %O, ui = %O', evt, ui);
			});
			elt.on('drop', function (evt, ui) {
				console.log('### ' + tag + ' > DROP.DROP: evt = %O, ui = %O', evt, ui);
			});
			break;
		case 'sort':
			elt.on('sortreceive', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.RECEIVE: evt = %O, ui = %O', evt, ui);
			});
			elt.on('sortremove', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.REMOVE: evt = %O, ui = %O', evt, ui);
			})
			elt.on('sortstart', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.START: evt = %O, ui = %O', evt, ui);
			});
			elt.on('sortstop', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.STOP: evt = %O, ui = %O', evt, ui);
			});
			elt.on('sortactivate', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.ACTIVATE: evt = %O, ui = %O', evt, ui);
			});
			elt.on('sortdeactivate', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.DEACTIVATE: evt = %O, ui = %O', evt, ui);
			});
			elt.on('sortupdate', function (evt, ui) {
				console.log('### ' + tag + ' > SORT.UPDATE: evt = %O, ui = %O', evt, ui);
			});
			break;
		default:
			throw new Error('Call Error: Event type must be one of: ["drag", "drop", "sort"]');
		}
		return elt;
	},

	/**
	 * Make this element draggable.
	 *
	 * @function external:"jQuery.fn"#_makeDraggableField
	 *
	 * @param {object} [opts]
	 * Change options passed to `draggable()`.
	 */

	_makeDraggableField: function (opts) {
		opts = deepDefaults(true, {
			classes: {
				'ui-draggable-handle': 'wcdv_drag_handle'
			},
			distance: 8, // FIXME Deprecated [1.12]: replacement will be in 1.13
			helper: 'clone',
			appendTo: document.body,
			revert: true,
			revertDuration: 0
		});
		this.attr('title', 'XXX'); // FIXME Without this, the 'content' property below does nothing!
		var tooltipContent = jQuery('<div>')
			.append(fontAwesome('fa-info-circle').css('padding-right', '0.25em').addClass('wcdv_text-primary'))
			.append(trans('GRID.TABLE.DRAGGABLE_FIELD_HELP'));
		this.tooltip({
			classes: {
				'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
			},
			show: { delay: 2000 },
			content: tooltipContent
		});
		return this
			.draggable(opts);
	},

	_makeSortableTable: function (cb) {
		var self = this;

		var helperClone = function (e, tr) {
			var originals = tr.children(),
				clonedRow = tr.clone(),
				start_idx = tr.index(),
				all_rows = tr.parent().children(),
				all_select = tr.find('select');

			// first set the size of the row that was cloned (clonedRow).
			// This keeps the table rows shape.
			clonedRow.children().each(function(index, val) {
				jQuery(val).width(originals.eq(index).width());
				//_.each(['box-sizing'], function (cssProp) {
				//	jQuery(val).css(cssProp, originals.eq(index).css(cssProp));
				//});
			});
			// second set the 'selected' value of any selects
			// found during the clone.  Seems jquery has a
			// bug that will not be fixed.
			clonedRow.find('select').val(function(index) {
				return all_select.eq(index).val();
			});
			// third lets place a temp class on all the rows
			// to keep the zerba striping, during the drag
			for (var i = start_idx+1; i < all_rows.length; i++) {
				if ((i % 2) == 0) {
					// this row should really be even but because
					// the clonedRow is hidden we need to make it
					// odd to avoid the 'shifting of colors in the zebra'
					jQuery(all_rows[i]).addClass('odd');
				} else {
					jQuery(all_rows[i]).addClass('even');
				}
			}
			// lastly put the correct zebra strip on the cloned row
			// that gets dragged around
			if ((start_idx % 2) == 0) {
				clonedRow.addClass('odd');
			} else {
				clonedRow.addClass('even');
			}
			return clonedRow;
		};

		self.on('keydown', 'button.drag-handle', function (event) {
			var tr = jQuery(event.currentTarget).closest('tr'),
				oldIndex = tr.index(),
				newIndex = oldIndex;

			// Reposition if one of the directional keys is pressed
			switch (event.keyCode) {
			case 38: // Up
				event.preventDefault();
				if (tr.prev().length) {
					tr.insertBefore(tr.prev());
				} else {
					// already at the top so exit
					return true;
				}
				break;
			case 40: // Down
				event.preventDefault();
				if (tr.next().length) {
					tr.insertAfter(tr.next());
				} else {
					// already at the bottom so exit
					return true;
				}
				break;
			default:
				return true; // Exit
			}
			newIndex = tr.index();
			if (oldIndex !== newIndex) {
				cb(oldIndex, newIndex);
			}
			// keep focus on the button after move
			jQuery(event.currentTarget).focus();
		});

		var opts = {
			forcePlaceholderSize: true,
			axis: 'y',
			cancel: 'input,textarea,select,option',
			helper: helperClone,
			handle: '.drag-handle',
			containment: self,
			// This event is triggered when sorting starts.
			start: function(event, ui) {
				// set the height of the placeholder row on start
				ui.placeholder.height(ui.helper.height());
				ui.item.data('originIndex', ui.item.index());
			},
			// This event is triggered when sorting has stopped.
			stop: function(event, ui) {
				var oldIndex = ui.item.data('originIndex'),
					newIndex = ui.item.index();
				// the drag has stopped so remove the classes that 'override'
				// the even/odd strips
				ui.item.parent().children().removeClass('even odd');

				if ( (typeof oldIndex !== 'undefined') &&
					(typeof newIndex !== 'undefined') &&
					(oldIndex !== newIndex) ) {
					// swap the rows in our internal data structure
					cb(oldIndex, newIndex);
				} else {
					// strange some bad data so just call the 'cancel' method
					jQuery(this).sortable('cancel');
				}
			}
		};

		self.sortable(opts);

		return this;
	},

	/**
	 * Specify what to do when a file is dropped onto this element.
	 *
	 * ```
	 * $('#fileDropTarget')._onFileDrop(function (files) {
	 *   something.addFiles(files);
	 * });
	 * ```
	 *
	 * @function external:"jQuery.fn"#_onFileDrop
	 *
	 * @param {function} cb
	 * Function to call when the file is dropped; it is passed a `File` array.
	 */

	_onFileDrop: function (cb) {
		// https://www.html5rocks.com/en/tutorials/file/dndfiles/
		function handleFileSelect(evt) {
			evt.stopPropagation();
			evt.preventDefault();
			cb(evt.dataTransfer.files);
		}

		function handleDragOver(evt) {
			evt.stopPropagation();
			evt.preventDefault();

			// Things I've tried to determine file type in drag+drop:
			//
			//   evt.dataTransfer.items[0].type => MIME Type
			//
			// +---------+--------------------------------------+
			// | Browser | Result                               |
			// +=========+======================================+
			// | Chrome  | ** OK **                             |
			// | Firefox | ** OK **                             |
			// | IE11    | evt.dataTransfer.items doesn't exist |
			// | Safari  | evt.dataTransfer.items doesn't exist |
			// | Edge    | evt.dataTransfer.items[0].type = ''  |
			// +---------+--------------------------------------+
			//
			// Setting the dropEffect:
			//
			// +---------+-----------------------------+
			// | Browser | Result                      |
			// +=========+=============================+
			// | Chrome  | ** OK **                    |
			// | Firefox | ** OK **                    |
			// | IE11    | None (performs navigation)  |
			// | Safari  | ** OK **                    |
			// | Edge    | None (file always accepted) |
			// +---------+-----------------------------+

			switch (getProp(evt.dataTransfer, 'items', 0, 'type')) {
			case 'text/csv':
			case 'application/csv':
			case 'application/vnd.ms-excel':
				evt.dataTransfer.dropEffect = 'copy';
				break;
			default:
				evt.dataTransfer.dropEffect = 'none';
			}
		}

		this.get(0).addEventListener('dragover', handleDragOver, false);
		this.get(0).addEventListener('drop', handleFileSelect, false);
	},

	/**
	 * Sets a delegated event handler for a click event that won't fire when the user clicks and
	 * drags.
	 *
	 * @function external:"jQuery.fn"#_onSingleClick
	 *
	 * @param {string} sel
	 * jQuery selector for the delegated event.
	 *
	 * @param {function} cb
	 * Function to call when the click happens.
	 *
	 * @param {string[]} mod
	 * A list of modifiers that must be present when the click is started. The modifiers are:
	 */

	_onSingleClick: function (sel, cb, mod) {
		var elt = this;
		var maxDist = 4;
		var evtInfo = {
			state: 'up',
			x0: 0,
			y0: 0
		};
		elt.on('mousedown', sel, function (evt) {
			if (mod != null) {
				if (
					(mod.indexOf('shift') >= 0 && !evt.shiftKey) ||
					(mod.indexOf('ctrl') >= 0 && !evt.ctrlKey) ||
					(mod.indexOf('alt') >= 0 && !evt.altKey)
				) {
					// User failed to hold a required mod key.
					return;
				}
				if (
					(evt.shiftKey && mod.indexOf('shift') < 0) ||
					(evt.ctrlKey && mod.indexOf('ctrl') < 0) ||
					(evt.altKey && mod.indexOf('alt') < 0)
				) {
					// User held a mod key they weren't supposed to.
					return;
				}
			}
			if (evt.shiftKey) {
				// Normally, holding shift selects text. Prevent that from happening.
				// FIXME: This loses any already existing selection. But restoring that is hard.
				document.getSelection().empty();
			}
			evtInfo.state = 'down';
			evtInfo.x0 = evt.clientX;
			evtInfo.y0 = evt.clientY;
		});
		elt.on('mousemove', sel, function () {
			if (evtInfo.state === 'down') {
				evtInfo.state = 'drag';
			}
		});
		elt.on('mouseup', sel, function (evt) {
			var moveDist = 0;
			switch (evtInfo.state) {
			case 'down':
				cb.call(this);
				break;
			case 'drag':
				moveDist = Math.sqrt(Math.pow(evt.clientX - evtInfo.x0, 2) + Math.pow(evt.clientY - evtInfo.y0, 2));
				if (moveDist < maxDist) {
					cb.call(this);
				}
				break;
			}
			evtInfo.state = 'up';
		});
	},

	findFieldCell: function (field) {
		return this.children().filter(function (i, elt) {
			return jQuery(elt).attr('data-wcdv-field') === field;
		});
	},

	/**
	 * A shortcut for accessing DataVis-specific attributes on elements.
	 *
	 * @function external:"jQuery.fn"#dvAttr
	 *
	 * @param {string|object} name
	 * When a string, the partial name of the attribute.  When an object, sets the values of a bunch
	 * of attributes at once.  In both cases, the attribute names are prefixed with `data-wcdv-`.
	 *
	 * @param {string} [val]
	 * Assigns this value to the attribute, if provided.
	 *
	 * @returns {string|jQuery}
	 * When getting, returns the attribute value, which is always a string because HTML.  When
	 * setting, returns `this` for chaining purposes.
	 */

	dvAttr: function () {
		var args = Array.prototype.slice.call(arguments);

		if (args.length === 1) {
			if (typeof args[0] === 'string') {
				return this.attr('data-wcdv-' + args[0]);
			}
			else if (typeof args[0] === 'object') {
				for (var p in args[0]) {
					if (Object.prototype.hasOwnProperty.call(args[0], p)) {
						args[0]['data-wcdv-' + p] = args[0][p];
						delete args[0][p];
					}
				}
				return this.attr(args[0]);
			}
			else {
				throw new Error('Call Error: Sole argument must be a string (getter) or object (setter)');
			}
		}
		else if (args.length === 2) {
			if (typeof args[0] !== 'string') {
				throw new Error('Call Error: With two arguments, first argument must be a string');
			}
			if (args[1] != null && typeof args[1] !== 'string' && typeof args[1] !== 'number') {
				if (typeof args[1] === 'boolean') {
					args[1] = args[1] ? '1' : '0';
				}
				else {
					throw new Error('Call Error: With two arguments, second must be a string, number, boolean, or null');
				}
			}

			return this.attr('data-wcdv-' + args[0], args[1]);
		}
		else {
			throw new Error('Call Error: dvAttr(string|object), dvAttr(string, string|number|boolean)');
		}
	}
});
