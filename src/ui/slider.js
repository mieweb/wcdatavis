import jQuery from 'jquery';
import {
	makeSubclass,
	mixinEventHandling,
} from '../util/misc.js';

// Constructor {{{1

/**
 * Create a new slider instance.  A slider is a UI element that slides in from the right side of the
 * screen.  It's typically used to display details of a row, but could be adapted to other uses.
 *
 * @class
 * @property {object} ui
 * @property {jQuery} ui.root
 * @property {jQuery} ui.header
 * @property {jQuery} ui.closeBtn
 * @property {jQuery} ui.body
 */

var Slider = makeSubclass('Slider', Object, function () {
	var self = this;

	self.ui = {};
});

// Events {{{2

/**
 * Fired when the slider is shown.
 *
 * @event Slider#show
 */

/**
 * Fired when the slider is hidden.
 *
 * @event Slider#hide
 */

mixinEventHandling(Slider, ['show', 'hide']);

// #draw {{{2

/**
 * Draw the slider and append it to the specified element.
 *
 * @param {jQuery} root
 * Where to put the new slider.
 */

Slider.prototype.draw = function (root) {
	var self = this;

	if (!(root instanceof jQuery)) {
		throw new Error('Call Error: `root` must be an instance of jQuery');
	}

	self.ui.root = jQuery('<div>', {
		'class': 'wcdv-slider'
	});
	self.ui.header = jQuery('<h1>');
	self.ui.closeBtn = jQuery('<button>', {
		'type': 'button',
		'class': 'wcdv-slider-close',
		'title': trans('SLIDER.CLOSE'),
		'aria-label': trans('SLIDER.CLOSE')
	}).text('×').on('click', function () {
		self.hide();
	});
	self.ui.body = jQuery('<div>', {
		'class': 'wcdv-slider-body'
	});

	self.ui.root
		.append(
			jQuery('<div>')
				.addClass('wcdv-slider-header')
				.append(self.ui.header)
				.append(self.ui.closeBtn)
		)
		.append(self.ui.body)
		.appendTo(root);
};

// #show {{{2

/**
 * Show the slider if it's currently invisible.
 */

Slider.prototype.show = function () {
	var self = this;

	if (!self.ui.root.hasClass('show')) {
		self.ui.root.addClass('show');
		self.fire('show');
	}
};

// #hide {{{2

/**
 * Hide the slider if it's currently visible.
 */

Slider.prototype.hide = function () {
	var self = this;

	if (self.ui.root.hasClass('show')) {
		self.ui.root.removeClass('show');
		self.fire('hide');
	}
};

// #setHeader {{{2

/**
 * Sets the header of the slider.
 *
 * @param {string} s
 * The header's text will be replaced with this.
 */

Slider.prototype.setHeader = function (s) {
	var self = this;

	self.ui.header.text(s);
};

// #setBody {{{2

/**
 * Sets the body of the slider.
 *
 * @param {jQuery} elt
 * This will replace the current slider body.
 */

Slider.prototype.setBody = function (elt) {
	var self = this;

	self.ui.body.html('');
	self.ui.body.append(elt);
};

// #destroy {{{2

/**
 * Removes the slider element from the page.
 */

Slider.prototype.destroy = function () {
	var self = this;

	self.ui.root.remove();
};

export default Slider;
