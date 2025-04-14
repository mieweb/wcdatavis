// Imports {{{1

import _ from 'underscore';
import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../../../trans.js';
import {
	debug,
	deepCopy,
	determineColumns,
	fontAwesome,
	format,
	gensym,
	getElement,
	getProp,
	getPropDef,
	isElement,
	isVisible,
	log,
	makeOperationButton,
	makeSubclass,
	mergeSort2,
	mixinEventHandling,
	objFromArray,
	onVisibilityChange,
	setPropDef,
	setTableCell,
	setElement,
} from '../../../util/misc.js';

import {AggregateInfo} from '../../../aggregates.js';
import {GridFilterSet} from '../../../grid_filter.js';
import {GridRenderer} from '../../../grid_renderer.js';
import {ComputedView} from '../../../computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from '../../../group_fun.js';

import handlebarsUtil from '../../../util/handlebars.js';
import GridTable from '../table.js';

// GridTableGroupDetail {{{1
// Constructor {{{2

/**
 * @class
 * @extends GridTable
 */

var GridTableGroupDetail = makeSubclass('GridTableGroupDetail', GridTable, function (grid, defn, view, features, opts, timing, id) {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.features.sort = false;

	console.debug('DataVis // %s // Constructing grid table; features = %O', self.toString(), features);
});

// #canRender {{{2

/**
 * Responds whether or not this grid table can render the type of data requested.
 *
 * @param {string} what
 * The kind of data the caller wants us to show.  Must be one of: plain, group, or pivot.
 *
 * @return {boolean}
 * True if this grid table can render that kind of data, false if it can't.
 */

GridTableGroupDetail.prototype.canRender = function (what) {
	return ['group'].indexOf(what) >= 0;
};

// #drawHeader {{{2

GridTableGroupDetail.prototype.drawHeader = function (columns, data, typeInfo, opts) {
	var self = this,
		headingTr,
		headingSpan,
		headingTh,
		headingThContainer,
		headingThControls,
		headingThCss = {
			'white-space': 'nowrap'
		},
		filterThCss = {
			'white-space': 'nowrap',
			'padding-top': 4,
			'vertical-align': 'top'
		};

	_.each(data.groupFields, function (field, fieldIdx) {
		var fcc = self.colConfig.get(field) || {};

		headingTr = jQuery('<tr>');

		if (self.features.rowSelect) {
			if (fieldIdx === 0) {
				self.ui.checkAll_thead = jQuery('<input>', {
					'name': 'checkAll',
					'type': 'checkbox',
					'class': 'wcdv_select_group',
					'data-group-id': '0'
				})
					.on('change', function (evt) {
						self.checkAll(evt);
					});

				headingTh = jQuery('<th>')
					.addClass('wcdv_group_col_spacer')
					.append(self.ui.checkAll_thead)
					.appendTo(headingTr);
			}
			else {
				jQuery('<th>')
					.addClass('wcdv_group_col_spacer')
					.appendTo(headingTr);
			}
		}

		// Add spacers for the previous group fields.

		for (var i = 0; i < fieldIdx + 1; i += 1) {
			jQuery('<th>')
				.addClass('wcdv_group_col_spacer')
				.appendTo(headingTr)
			;
		}

		// headingTh <TH>
		//   headingThContainer <DIV>
		//     headingSpan <SPAN>
		//     headingThControls <DIV>

		headingSpan = jQuery('<span>')
			.attr({
				'data-wcdv-field': field,
				'data-wcdv-draggable-origin': 'GRID_TABLE_HEADER'
			})
			.addClass('wcdv_heading_title')
			.text(fcc.displayText || field)
			._makeDraggableField()
		;

		headingThControls = jQuery('<div>');

		headingThContainer = jQuery('<div>')
			.addClass('wcdv_heading_container')
			.append(headingSpan, headingThControls);

		headingTh = jQuery('<th>')
			.attr('colspan', columns.length - fieldIdx)
			.css(headingThCss)
			.append(headingThContainer)
		;

		self._addSortingToHeader(data, 'vertical', {groupFieldIndex: fieldIdx}, headingThControls.get(0));

		self.setCss(headingTh, field);

		self.ui.thMap[field] = headingTh;

		headingTr.append(headingTh);
		self.ui.thead.append(headingTr);
	});

	headingTr = jQuery('<tr>');

	// Add spacers for all the group fields.

	if (self.features.rowSelect) {
		jQuery('<th>')
			.addClass('wcdv_group_col_spacer')
			.appendTo(headingTr);
	}

	for (var i = 0; i < data.groupFields.length + 1; i += 1) {
		jQuery('<th>')
			.addClass('wcdv_group_col_spacer')
			.appendTo(headingTr)
		;
	}

	// Make headers for all the normal (non-grouped) columns.

	_.each(columns, function (field, colIndex) {
		var fcc = self.colConfig.get(field) || {};

		if (data.groupFields.indexOf(field) >= 0) {
			return;
		}

		headingSpan = jQuery('<span>')
			.attr({
				'data-wcdv-field': field,
				'data-wcdv-draggable-origin': 'GRID_TABLE_HEADER'
			})
			.addClass('wcdv_heading_title')
			.text(fcc.displayText || field)
			._makeDraggableField()
		;

		headingThControls = jQuery('<div>');

		headingThContainer = jQuery('<div>')
			.addClass('wcdv_heading_container')
			.append(headingSpan, headingThControls);

		headingTh = jQuery('<th>')
			.css(headingThCss)
			.append(headingThContainer);

		if (colIndex > 0) {
			headingTh.addClass('wcdv_pivot_colval_boundary');
		}

		self._addSortingToHeader(data, 'vertical', {field: field}, headingThControls.get(0));

		self.setCss(headingTh, field);
		self.setAlignment(headingTh, fcc, typeInfo.get(field));

		self.ui.thMap[field] = headingTh;
		headingTr.append(headingTh);
	});

	self.ui.thead.append(headingTr);
};

// #drawBody {{{2

GridTableGroupDetail.prototype.drawBody = function (data, typeInfo, columns, cont, opts) {
	var self = this;
	// self.ui.tbl.append(self.ui.tbody);

	// TYPES OF CHECKBOXES:
	//
	//   .wcdv_select_row
	//     * data-row-num = What the rowNum for this data row is.
	//     * [tr] data-wcdv-rowValIndex = What rowVal this row is in.
	//
	//   .wcdv_select_group

	if (!data.isGroup) {
		if (typeof cont === 'function') {
			return cont();
		}
		else {
			return;
		}
	}

	if (self.opts.generateCsv) {
		self.addDataToCsv(data);
	}

	// percolateUp() {{{3

	function percolateUp(node /* groupInfo elt */) {
		var disabled = false;
		var checked = false;
		var indeterminate = false;

		// When a node has no children ...
		//
		//   - it contains data rows in the UI
		//   - its height in the metadata tree is the # of group fields
		//   - it represents a complete rowval
		//
		// ... the number of selected rows is meant to be determined by the caller.

		if (node.metadata.children != null) {
			node.numSelected = 0;
			_.each(node.metadata.children, function (child) {
				node.numSelected += self.groupInfo[child.id].numSelected;
			});
		}

		if (node.metadata.numRows === 0) {
			disabled = true;
			checked = false;
		}
		else {
			if (node.numSelected === 0) {
				checked = false;
			}
			else if (node.numSelected === node.metadata.numRows) {
				checked = true;
			}
			else {
				indeterminate = true;
			}
		}

		node.checkbox.prop('disabled', disabled);
		node.checkbox.prop('checked', checked);
		node.checkbox.prop('indeterminate', indeterminate);

		if (node.metadata.parent) {
			percolateUp(self.groupInfo[node.metadata.parent.id]);
		}
	}

	// percolateDown() {{{3

	function percolateDown(node /* groupInfo elt */, isChecked) {
		node.checkbox.prop('disabled', false);
		node.checkbox.prop('checked', isChecked);
		node.checkbox.prop('indeterminate', false);

		node.numSelected = isChecked ? node.metadata.numRows : 0;

		if (node.metadata.children == null) {
			self.ui.tbody
				.find('tr[data-wcdv-in-group=' + node.metadata.id + ']')
				.find('input[type="checkbox"].wcdv_select_row')
				.prop('checked', isChecked);
			_.each(data.data[node.metadata.rowValIndex], function (row) {
				if (isChecked) {
					self.select(row.rowNum);
				}
				else {
					self.unselect(row.rowNum);
				}
			});
		}
		else {
			_.each(node.metadata.children, function (child) {
				percolateDown(self.groupInfo[child.id], isChecked);
			});
		}
	}

	// }}}3

	/*
	self.ui.tbody.on('change', 'input[type="checkbox"].wcdv_select_row', function () {
		var elt = jQuery(this);
		var tr = elt.closest('tr');
		var isChecked = elt.prop('checked');
		var rowNum = +tr.attr('data-row-num');
		var rowValIndex = +tr.attr('data-wcdv-rowValIndex');
		var rowValMetadata = data.groupMetadata.lookup.byRowValIndex[rowValIndex];

		console.debug('DataVis // ' + 'GRID TABLE // GROUP - DETAIL // SELECT',
			'Selecting data row: rowNum = %d, rowValIndex = %d, parentGroupId = %s, parentGroupInfo = %O',
			rowNum, rowValIndex, rowValMetadata.id, self.groupInfo[rowValMetadata.id]);

		self.groupInfo[rowValMetadata.id].numSelected += isChecked ? 1 : -1;

		percolateUp(self.groupInfo[rowValMetadata.id]);
	});

	self.ui.tbody.on('change', 'input[type="checkbox"].wcdv_select_group', function () {
		var elt = jQuery(this);
		var tr = elt.closest('tr');
		var isChecked = elt.prop('checked');
		var groupMetadataId = +tr.attr('data-wcdv-toggles-group');

		percolateDown(self.groupInfo[groupMetadataId], isChecked);
		percolateUp(self.groupInfo[groupMetadataId]);
	});
	*/

	var isRendered = {}; // isRendered[metadataId] => boolean
	var lastRenderedTr = {}; // lastRenderedTr[metadataId] => jQuery <TR>

	// groupInfo {{{3

	// groupInfo[id] -> {
	//   metadata
	//   numSelected
	//   checkbox
	// }

	self.groupInfo = (function () {
		var mapping = {};

		function recur(node) {
			mapping[node.id] = {
				metadata: node,
				numSelected: 0
			};
			if (node.children != null) {
				_.each(node.children, recur);
			}
		}

		recur(data.groupMetadata);
		mapping[0].checkbox = self.ui.checkAll_thead;
		return mapping;
	})();

	// toggleGroup() {{{3

	/*
	 * Toggle a sub-group open/closed.  This is meant to be used as a jQuery event handler, e.g. for a
	 * click event.
	 */

	function toggleGroup() {

		/*
		 * Toggle the visibility of the subgroup.
		 *
		 *   - metadataId: number
		 *     What group we are expanding/collapsing.
		 *
		 *   - show: boolean
		 *     If true, show the rows in the group; otherwise hide them.
		 *
		 *   - tr: jQuery (TR)
		 *     The table row for the subgroup header.
		 */

		function toggle(metadataId, show, tr) {
			// Within the group metadata, the rowValIndex is only defined for things which are leaves in
			// the grouping tree and therefore complete a rowVal.

			var rowValIndex = self.data.groupMetadata.lookup.byId[metadataId].rowValIndex;

			console.debug('[DataVis // %s // Toggle] show = %s, id = %s, rowValIndex = %s',
				self.toString(), show, metadataId, rowValIndex);

			// Check if we're expanding a leaf, thus fully expanding an entire group, and see if we need
			// to render table rows for all the records in that group.

			if (show && !isRendered[metadataId]) {
				console.debug('[DataVis // %s // Toggle] Rendering: group metadata ID = %s',
					self.toString(), metadataId);
				render(metadataId, 0, tr);
			}

			// Set the visibility for all affected table rows.  These can be for children of the current
			// node in the tree (i.e. when expanding the current node does not complete a group), or for
			// records in a fully expanded group: we don't distinguish between these two when it comes to
			// showing/hiding as the attributes used on the elements are the same.

			self.ui.tbody
				.find('tr')
				.filter(function (i, elt) {
					return jQuery(elt).attr('data-wcdv-in-group') === '' + metadataId;
				})
				.each(function (i, elt) {
					elt = jQuery(elt);
					if (elt.attr('data-wcdv-toggles-group')) {
						toggle(+elt.attr('data-wcdv-toggles-group'), show && elt.attr('data-wcdv-expanded') === '1', elt);
					}
					if (show) {
						elt.show();
					}
					else {
						elt.hide();
					}
				})
			;

			if (self.ui.tbl.floatThead) {
				self.ui.tbl.floatThead('reflow');
			}
		}

		var elt = jQuery(this);
		var tr = elt.closest('tr');

		var op = tr.attr('data-wcdv-expanded') === '0' ? 'show' : 'hide';

		if (op === 'show') {
			tr.find('.spinner').show();
		}
		window.setTimeout(function () {
			toggle(+tr.attr('data-wcdv-toggles-group'), op === 'show', tr);
			if (op === 'show') {
				tr.find('.spinner').hide();
			}
			tr.attr('data-wcdv-expanded', op === 'show' ? '1' : '0');
			elt.attr('data-wcdv-expanded', op === 'show' ? '1' : '0');
			elt.html(fontAwesome(op === 'show' ? 'fa-minus-square-o' : 'fa-plus-square-o'));
		});
	}

	// render() {{{3

	/**
	 * @param {number} [metadataId=0]
	 * @param {number} [startIndex=0]
	 * @param {jQuery} [afterElement]
	 */

	function render(metadataId, startIndex, afterElement, showAll) {
		if (metadataId != null && typeof metadataId !== 'number') {
			throw new Error('Call Error: `metadataId` must be null or a number');
		}
		if (startIndex != null && typeof startIndex !== 'number') {
			throw new Error('Call Error: `startIndex` must be null or a number');
		}
		if (afterElement != null && !(afterElement instanceof jQuery)) {
			throw new Error('Call Error: `afterElement` must be null or an instance of jQuery');
		}

		if (metadataId == null) metadataId = 0;
		if (startIndex == null) startIndex = 0;

		if (startIndex > 0 && afterElement == null)
			throw new Error('Call Error: `afterElement` required when `startIndex` > 0');

		var metadataNode = data.groupMetadata.lookup.byId[metadataId];

		if (metadataNode == null)
			throw new Error('No group metadata for specified ID: ' + metadataId);

		var limitConfig = self.defn.table.limit;

		var showMoreTr,lastInsertedTr;

		if (afterElement != null && startIndex > 0) {
			showMoreTr = afterElement.nextAll('tr.wcdvgrid_more[data-wcdv-in-group="' + metadataId + '"]');
			afterElement = showMoreTr.prev();
			showMoreTr.remove();
		}

		var isExpanded = self.defn.table.whenGroup.showExpandedGroups ? '1' : '0';

		if (metadataNode.children) {
			// We're rendering sub-groups.

			var i, j;
			var childMetadataNode;
			var childTr;
			var checkbox;
			var expandBtn;
			var infoText, infoTextSpan;
			var fcc;
			var t, v;
			var rowValElt, rowValEltSpan, rowValEltTh;
			var showMoreTd;
			var colSpan;

			var trans = {
				'group:singular': 'group',
				'group:plural': 'groups',
				'row:singular': 'row',
				'row:plural': 'rows'
			};

			var childRowValElts = mergeSort2(_.pluck(metadataNode.children, 'rowValElt'));
			var childRowValEltsLen = childRowValElts.length;

			var howMany = !self.features.limit || showAll ? childRowValEltsLen
				: startIndex === 0 ? limitConfig.threshold
				: limitConfig.chunkSize;

			for (i = startIndex; i < childRowValEltsLen && i < startIndex + howMany; i += 1) {
				childMetadataNode = metadataNode.children[childRowValElts[i]];

				childTr = jQuery('<tr>')
					.attr('data-wcdv-in-group', metadataNode.id)
					.attr('data-wcdv-toggles-group', childMetadataNode.id)
					.attr('data-wcdv-expanded', isExpanded)
				;

				// Insert spacer columns for previous group fields.

				for (j = 0; j < childMetadataNode.groupFieldIndex; j += 1) {
					jQuery('<th>', {'class': 'wcdv_group_col_spacer'})
						.appendTo(childTr);
				}

				var disabled = childMetadataNode.children == null && childMetadataNode.rows.length === 0;

                expandBtn = jQuery('<button>', {
                    'type': 'button',
                    'class': 'wcdv_icon_button wcdv_expand_button',
                    'data-wcdv-expanded': isExpanded,
                    'disabled': disabled
                }).html(fontAwesome(isExpanded === '1' ? (disabled ? 'fa-square-o':'fa-minus-square-o' ) : (disabled ? 'fa-square-o' : 'fa-plus-square-o')));

				jQuery('<th>', {'class': 'wcdv_group_col_spacer'})
					.append(expandBtn)
					.appendTo(childTr);

				// Create the check box which selects the row.

				if (self.features.rowSelect) {
					checkbox = jQuery('<input>', {
						'type': 'checkbox',
						'class': 'wcdv_select_group',
						'data-group-id': childMetadataNode.id,
					});
					self.groupInfo[childMetadataNode.id].checkbox = checkbox;
					jQuery('<th>', {'class': 'wcdv_group_col_spacer'})
						.append(checkbox)
						.appendTo(childTr);
				}

				fcc = self.colConfig.get(childMetadataNode.groupField) || {};
				t = self.typeInfo.get(childMetadataNode.groupField);
				v = childMetadataNode.rowValCell || childMetadataNode.rowValElt;

				if (childMetadataNode.groupSpec.fun != null) {
					t = {
						type: GROUP_FUNCTION_REGISTRY.get(childMetadataNode.groupSpec.fun).resultType
					};
					v = childMetadataNode.rowValElt;
				}

				rowValElt = format(fcc, t, v);
				rowValEltSpan = jQuery('<span>');

				if (rowValElt instanceof Element || rowValElt instanceof jQuery) {
					rowValEltSpan.append(rowValElt);
				}
				else if (fcc.allowHtml) {
					rowValEltSpan.html(rowValElt);
				}
				else {
					rowValEltSpan.text(rowValElt);
				}

				infoText = '(';
				if (childMetadataNode.children != null) {
					infoText += childMetadataNode.numChildren + ' ';
					infoText += (childMetadataNode.numChildren === 1 ? trans['group:singular'] : trans['group:plural']) + ', ';
				}
				infoText += childMetadataNode.numRows + ' ';
				infoText += childMetadataNode.numRows === 1 ? trans['row:singular'] : trans['row:plural'];
				infoText += ')';

				infoTextSpan = jQuery('<span>').css({'margin-left': '0.5em'}).text(infoText);

				var spinnerDiv = jQuery('<div>', {'class': 'spinner'})
					.append(jQuery('<div>', {'class': 'bounce1'}))
					.append(jQuery('<div>', {'class': 'bounce2'}))
					.append(jQuery('<div>', {'class': 'bounce3'}))
					.hide();

				jQuery('<th>', {
					'class': 'wcdv_group_value',
					'data-wcdv-field': childMetadataNode.groupField,
					'colspan': columns.length - childMetadataNode.groupFieldIndex
				})
					.append(rowValEltSpan)
					.append(infoTextSpan)
					.append(spinnerDiv)
					.appendTo(childTr);

				if (afterElement != null) {
					afterElement.after(childTr);
				}
				else {
					self.ui.tbody.append(childTr);
				}

				var rowRenderCb = getProp(self.opts, 'events', 'rowRender');
				if (typeof rowRenderCb === 'function') {
					rowRenderCb(childTr, {
						isGroup: true,
						groupMode: 'detail',
						groupField: childMetadataNode.groupField,
						rowValElt: childMetadataNode.rowValCell.value,
						groupMetadata: childMetadataNode
					});
				}
				if(self.defn.table.whenGroup.showExpandedGroups){
					afterElement = render(childMetadataNode.id, 0, childTr);
					
				} else {
					afterElement = childTr;
				}
			}

			isRendered[metadataNode.id] = true;

			if (i < childRowValEltsLen) {
				// Not all children were rendered.

				lastRenderedTr[metadataNode.id] = childTr;
				for (var p = metadataNode.parent; p != null; p = p.parent) {
					lastRenderedTr[p.id] = childTr;
				}

				showMoreTr = jQuery('<tr>', {'class': 'wcdvgrid_more', 'data-wcdv-in-group': metadataNode.id});

				// Insert spacer columns for previous group fields.

				for (j = 0; j < childMetadataNode.groupFieldIndex; j += 1) {
					jQuery('<th>', {'class': 'wcdv_group_col_spacer'})
						.appendTo(showMoreTr);
				}

				colSpan = columns.length
					+ 1 // for the "expand" button column
					+ (self.features.rowSelect ? 1 : 0)
					+ (self.features.rowReorder ? 1 : 0)
					- (metadataNode.groupFieldIndex || 0);

				spinnerDiv = jQuery('<div>', {'class': 'spinner'})
					.append(jQuery('<div>', {'class': 'bounce1'}))
					.append(jQuery('<div>', {'class': 'bounce2'}))
					.append(jQuery('<div>', {'class': 'bounce3'}))
					.hide();

				showMoreTd = jQuery('<td>', {
					'class': 'wcdv_show_more',
					'data-wcdv-in-group': metadataNode.id,
					'data-wcdv-show-more-start': i,
					'colspan': colSpan
				})
					.append(fontAwesome('fa-chevron-circle-down'))
					.append(jQuery('<span>Showing rows 1–' + i + ' of ' + childRowValEltsLen + '.</span>')
						.css({'padding-left': '0.5em'}))
					.append(jQuery('<button type="button">Load ' + limitConfig.chunkSize + ' more rows.</button>')
						.css({'margin-left': '0.5em'}))
					.append(jQuery('<button type="button" class="wcdv_show_all">Load all rows.</button>')
						.css({'margin-left': '0.5em'})
					)
					.append(spinnerDiv)
					.appendTo(showMoreTr);

				childTr.after(showMoreTr);
			}
			lastInsertedTr = afterElement;
		}
		else if (metadataNode.rows) {
			// We're rendering data rows.

			var isSelected;
			var checkbox;
			var row;
			var rowTr;
			var showMoreTd;
			var colSpan;

			var howMany = (!self.features.limit || showAll) ? metadataNode.rows.length - startIndex
				: startIndex === 0 ? limitConfig.threshold
				: limitConfig.chunkSize;

			for (i = startIndex; i < metadataNode.rows.length && i < startIndex + howMany; i += 1) {
				row = metadataNode.rows[i];

				rowTr = jQuery('<tr>', {
					'id': self.defn.table.id + '_' + i,
					'data-row-num': row.rowNum,
					'data-wcdv-in-group': metadataNode.id,
					'data-wcdv-rowValIndex': metadataNode.rowValIndex
				});

				// Insert some space to "indent" the data.
				// TODO When does one of these work differently from the other?

				//jQuery('<td>', {'colspan': data.groupFields.length + 1}).appendTo(rowTr);
				for (var spacerIndex = 0; spacerIndex < data.groupFields.length + 1; spacerIndex += 1) {
					jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).appendTo(rowTr);
				}

				// Create the check box which selects the row.

				if (self.features.rowSelect) {
					isSelected = self.isSelected(row.rowNum);
					checkbox = jQuery('<input>', {
						'type': 'checkbox',
						'data-row-num': row.rowNum,
						'class': 'wcdv_select_row',
						'checked': isSelected
					});
					jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).append(checkbox).appendTo(rowTr);
				}

				// Create the data cells.

				_.each(columns, function (field, colIndex) {
					if (data.groupFields.indexOf(field) >= 0) {
						return;
					}

					var fcc = self.colConfig.get(field) || {};
					var cell = row.rowData[field];

					var td = jQuery('<td>', {'data-wcdv-field': field});
					if (colIndex > 0) {
						td.addClass('wcdv_pivot_colval_boundary');
					}
					var value = format(fcc, typeInfo.get(field), cell);

					if (value instanceof Element || value instanceof jQuery) {
						td.append(value);
					}
					else if (fcc.allowHtml && typeInfo.get(field).type === 'string') {
						td.html(value);
					}
					else if (value === '') {
						td.html('&nbsp;');
					}
					else {
						td.text(value);
					}

					self.setCss(td, field);
					self.setAlignment(td, fcc, typeInfo.get(field));

					rowTr.append(td);
				});

				if (self.features.rowSelect && isSelected) {
					rowTr.children('td').addClass('wcdv_selected_row');
				}

				self.ui.tr[i] = rowTr;
				afterElement.after(rowTr);
				afterElement = rowTr;

				var rowRenderCb = getProp(self.opts, 'events', 'rowRender');
				if (typeof rowRenderCb === 'function') {
					rowRenderCb(rowTr, {
						isGroup: true,
						groupMode: 'details',
						rowData: row.rowData,
						rowNum: row.rowNum
					});
				}
			}

			isRendered[metadataNode.id] = true;

			if (i < metadataNode.rows.length) {
				// Not all children were rendered.

				lastRenderedTr[metadataNode.id] = rowTr;
				for (var p = metadataNode.parent; p != null; p = p.parent) {
					lastRenderedTr[p.id] = rowTr;
				}

				showMoreTr = jQuery('<tr>', {'class': 'wcdvgrid_more', 'data-wcdv-in-group': metadataNode.id});

				// Insert spacer columns for previous group fields.

				for (j = 0; j < metadataNode.groupFieldIndex + 1; j += 1) {
					jQuery('<th>', {'class': 'wcdv_group_col_spacer'})
						.appendTo(showMoreTr);
				}

				colSpan = columns.length
					+ 1 // for the "expand" button column
					+ (self.features.rowSelect ? 1 : 0)
					+ (self.features.rowReorder ? 1 : 0)
					- (metadataNode.groupFieldIndex + 1);

				spinnerDiv = jQuery('<div>', {'class': 'spinner'})
					.append(jQuery('<div>', {'class': 'bounce1'}))
					.append(jQuery('<div>', {'class': 'bounce2'}))
					.append(jQuery('<div>', {'class': 'bounce3'}))
					.hide();

				showMoreTd = jQuery('<td>', {
					'class': 'wcdv_show_more',
					'data-wcdv-in-group': metadataNode.id,
					'data-wcdv-show-more-start': i,
					'colspan': colSpan
				})
					.append(fontAwesome('fa-chevron-circle-down'))
					.append(jQuery('<span>Showing rows 1–' + i + ' of ' + metadataNode.rows.length + '.</span>')
						.css({'padding-left': '0.5em'}))
					.append(jQuery('<button type="button">Load ' + limitConfig.chunkSize + ' more rows.</button>')
						.css({'margin-left': '0.5em'}))
					.append(jQuery('<button type="button" class="wcdv_show_all">Load all rows.</button>')
						.css({'margin-left': '0.5em'})
					)
					.append(spinnerDiv)
					.appendTo(showMoreTr);

				rowTr.after(showMoreTr);
			}
			lastInsertedTr = rowTr;
		}

		self._updateSelectionGui();

		if (self.features.floatingHeader) {
			switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
			case 'tabletool':
				window.TableTool.update();
				break;
			}
		}
		return lastInsertedTr;
	}

	// showMore() {{{3

	function showMore(showAll) {
		var elt = jQuery(this).closest('td');
		var metadataId = +(elt.attr('data-wcdv-in-group'));
		var startIndex = +(elt.attr('data-wcdv-show-more-start'));
		var afterElement = lastRenderedTr[metadataId];

		afterElement.nextAll('tr.wcdvgrid_more[data-wcdv-in-group="' + metadataId + '"]').find('.spinner').show();

		window.setTimeout(function () {
			render(metadataId, startIndex, afterElement, showAll);
			// No need to hide the spinner because the "show more" row should be gone.
		});
	}

	// }}}3

	render();
	self.ui.tbody.on('click', 'button.wcdv_expand_button', toggleGroup);
	self.ui.tbody.on('click', 'td.wcdv_show_more button.wcdv_show_all', function (evt) {
		evt.stopPropagation();
		showMore.call(this, true);
	});
	self.ui.tbody.on('click', 'td.wcdv_show_more', function (evt) {
		showMore.call(this, false);
	});

	self._updateSelectionGui();

	if (self.features.floatingHeader) {
		switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
		case 'tabletool':
			window.TableTool.update();
			break;
		}
	}

	if (typeof cont === 'function') {
		return cont();
	}
};

// #drawFooter {{{2

GridTableGroupDetail.prototype.drawFooter = function (columns, data, typeInfo) {
	var self = this;

	var makeSelectAll = function (tr) {
		self.ui.checkAll_tfoot = jQuery('<input>', {
			'name': 'checkAll',
			'type': 'checkbox',
			'class': 'wcdv_select_group',
			'data-group-id': '0'
		})
			.on('change', function (evt) {
				self.checkAll(evt);
			});
		jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).append(self.ui.checkAll_tfoot).appendTo(tr);
	};

	var makeAggregateRow = function () {
		// Circumventing the correct logic here because TableTool requires an empty footer in order to
		// implement horizontal scrolling; if you omit the footer (with a TR and all appropriate TD's in
		// it) then you can't scroll horizontally.
		if (false && getProp(self.defn, 'table', 'footer') == null) {
			return;
		}

		var tr = jQuery('<tr>');

		// Add the "select all" checkbox when row selection is enabled.

		if (self.features.rowSelect) {
			makeSelectAll(tr);
		}

		for (var spacerIndex = 0; spacerIndex < data.groupFields.length + 1; spacerIndex += 1) {
			jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).appendTo(tr);
		}

		// Create the columns for the data fields, which contain aggregate function results over those
		// fields.

		var didFooterCell = false;

		tr.append(_.map(columns, function (field, colIndex) {
			if (data.groupFields.indexOf(field) >= 0) {
				return;
			}

			var fcc = self.colConfig.get(field) || {};
			var colTypeInfo = typeInfo.get(field);
			var td = jQuery('<td>');
			var footerConfig = getProp(self.defn, 'table', 'footer', field);
			var agg;
			var aggFun;
			var aggResult;
			var footerVal;

			self.setCss(td, field);
			self.setAlignment(td, fcc, typeInfo.get(field));

			if (footerConfig == null) {
				if (didFooterCell) {
					td.addClass('wcdv_divider');
				}

				didFooterCell = false;
			}
			else {
				if (colIndex > 0) {
					td.addClass('wcdv_divider');
				}

				didFooterCell = true;

				// Although the footer config is an aggregate spec, there is one place we allow more
				// flexibility.  If the fields aren't set, use the field for the column in which we're
				// displaying this footer.  This is merely a convenience for the most common case.

				if (footerConfig.fields == null) {
					footerConfig.fields = [field];
				}

				console.debug('[DataVis // %s // Footer(%s)] Creating footer using config: %O',
					self.toString(), field, footerConfig);

				var aggInfo = new AggregateInfo('all', footerConfig, 0, self.colConfig, typeInfo, function (tag, fti) {
					if (fti.needsDecoding) {
						console.debug('[DataVis // %s // Footer(%s) // %s] Converting data: { field = "%s", type = "%s" }',
							self.toString(), field, tag, fti.field, fti.type);

						Source.decodeAll(data.dataByRowId, fti.field);
					}

					fti.deferDecoding = false;
					fti.needsDecoding = false;
				});
				aggResult = aggInfo.instance.calculate(data.groupMetadata.rows);
				var aggResult_formatted;

				if (isElement(aggResult)) {
					footerVal = aggResult;
				}
				else {
					if (aggInfo.instance.inheritFormatting) {
						aggResult_formatted = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
							overrideType: aggInfo.instance.getType()
						});
					}
					else {
						aggResult_formatted = format(null, null, aggResult, {
							overrideType: aggInfo.instance.getType(),
							decode: false
						});
					}

					if (aggInfo.debug) {
						console.debug('[DataVis // %s // Footer(%s)] Aggregate result: %s',
							self.toString(), field, JSON.stringify(aggResult));
					}

					switch (typeof footerConfig.format) {
					case 'function':
						footerVal = footerConfig.format(aggResult_formatted);
						break;
					case 'string':
						footerVal = sprintf.sprintf(footerConfig.format, aggResult_formatted);
						break;
					default:
						throw new Error('Footer config for field "' + field + '": `format` must be a function or a string');
					}
				}

				if (footerVal instanceof Element || footerVal instanceof jQuery) {
					td.append(footerVal);
				}
				else {
					td.text(footerVal);
				}
			}

			return td;
		}));

		// Finish the row that contains the aggregate functions.

		self.ui.tfoot.append(tr);
	};

	var makeExternalFooterRow = function () {
		// Create a new footer row for an external footer that we've absorbed into the grid.

		if (self.opts.footer == null || !self.opts.stealGridFooter) {
			return;
		}

		var tr = jQuery('<tr>');

		if (!isVisible(self.opts.footer)) {
			tr.hide();
		}

		if (self.features.rowSelect) {
			// Circumventing the correct logic here because TableTool requires an empty footer in order to
			// implement horizontal scrolling; if you omit the footer (with a TR and all appropriate TD's
			// in it) then you can't scroll horizontally.
			if (true || getProp(self.defn, 'table', 'footer')) {
				// There is an aggregate row, so it contains the "select all" checkbox.
				jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).appendTo(tr);
			}
			else {
				// There is no aggregate row, so make the "select all" checkbox here.
				makeSelectAll(tr);
			}
		}
		// colspan = (spacers: # groupFields + 1) + (columns: # fields - # groupFields) = (# fields) + 1
		jQuery('<td>', {'colspan': columns.length + 1}).append(self.opts.footer).appendTo(tr);
		self.ui.tfoot.append(tr);
	};

	makeAggregateRow();
	makeExternalFooterRow();
};

// #addWorkHandler {{{2

GridTableGroupDetail.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on(ComputedView.events.workEnd, function (info, ops) {
		console.debug('DataVis // ' + 'GRID TABLE - GROUP - DETAIL // HANDLER (ComputedView.workEnd)', 'ComputedView has finished doing work');

		if (!ops.group || ops.pivot) {
			self.fire('unableToRender', null, ops);
			return;
		}

		console.debug('DataVis // ' + 'GRID TABLE - GROUP - DETAIL // HANDLER (ComputedView.workEnd)', 'Redrawing because the view has done work');
		self.draw(self.root);
	}, { who: self });
};

// #_addRowSelectHandler {{{2

/**
 * Add an event handler for the row select checkboxes.  The event is bound on `self.ui.tbody` and
 * looks for checkbox inputs inside TD elements with class `wcdv_group_col_spacer` to actually handle
 * the events.  The handler calls `self.select(ROW_NUM)` or `self.unselect(ROW_NUM)` when the
 * checkbox is changed.
 */

GridTableGroupDetail.prototype._addRowSelectHandler = function () {
	var self = this;

	self.ui.tbody.on('change', 'input[type="checkbox"].wcdv_select_row', function () {
		var elt = jQuery(this);
		var rowNum = +elt.attr('data-row-num');
		var isChecked = elt.prop('checked');

		if (isChecked) {
			self.select(rowNum);
		}
		else {
			self.unselect(rowNum);
		}
	});

	self.ui.tbody.on('change', 'input[type="checkbox"].wcdv_select_group', function () {
		var elt = jQuery(this);
		var isChecked = elt.prop('checked');
		var groupMetadataId = +elt.attr('data-group-id');
		var rowNums = [];

		// Find all rows that are a descendant of the selected group.

		function recur(node) {
			if (node.children == null) {
				rowNums = rowNums.concat(_.pluck(self.data.data[node.rowValIndex], 'rowNum'));
			}
			else {
				_.each(node.children, recur);
			}
		}

		recur(self.data.groupMetadata.lookup.byId[groupMetadataId]);

		if (isChecked) {
			self.select(rowNums);
		}
		else {
			self.unselect(rowNums);
		}
	});
};

// #_updateSelectionGui {{{2

/**
 * Update the checkboxes in the grid table to match what the current selection is.
 */

GridTableGroupDetail.prototype._updateSelectionGui = function () {
	var self = this;

	// First, deselect all rows (remove "selected" class and uncheck the box).

	self.root.find('tbody td.wcdv_selected_row').removeClass('wcdv_selected_row');
	self.root.find('tbody input[type="checkbox"].wcdv_select_row').prop('checked', false);
	self.root.find('tbody input[type="checkbox"].wcdv_select_group').prop('checked', false);

	// Next, find all the TR elements which correspond to selected rows.

	var trs = self.root.find('tbody tr').filter(function (_idx, elt) {
		return self.selection.indexOf(+(jQuery(elt).attr('data-row-num'))) >= 0;
	});

	// Select appropriate rows (add "selected" class and check the box).

	trs.children('td').addClass('wcdv_selected_row');
	trs.find('input[type="checkbox"].wcdv_select_row').prop('checked', true);

	// ===============================================================================================
	//
	//   DETERMINE GROUPING (HIERARCHICAL, PARENT) CHECKBOX STATES
	//
	// ===============================================================================================

	// Initialize the structure with no rows selected in any leaf.

	var numSelected = {};

	_.each(_.keys(self.data.groupMetadata.lookup.byId), function (id) {
		numSelected[id] = 0;
	});

	// Determine how many are selected in each leaf of the tree.

	for (var i = 0; i < self.selection.length; i += 1) {
		var s = self.selection[i];
		var id = getProp(self.data, 'groupMetadata', 'lookup', 'byRowNum', s, 'id');

		if (id == null) {
			// This can happen when the selected row has been filtered out, so there's no group metadata
			// entry for that row number.

			continue;
		}

		if (numSelected[id] == null) {
			numSelected[id] = 0;
		}

		numSelected[id] += 1;
	}

	// Determine how many are selected at all non-leaf nodes.

	(function () {
		function postorder(node) {
			if (node.children != null) {
				numSelected[node.id] = 0;
				_.each(node.children, function (c) {
					postorder(c);
					numSelected[node.id] += numSelected[c.id];
				});
			}
		}

		postorder(self.data.groupMetadata);
	})();

	_.each(numSelected, function (count, id) {
		var numRows = self.data.groupMetadata.lookup.byId[id].numRows;
		var checkbox = self.root.find('input[type="checkbox"][data-group-id="' + id + '"].wcdv_select_group');

		if (checkbox.length === 0) {
			// This can happen when the rows for the sub-groups haven't been rendered yet.

			return;
		}

		if (numRows === 0) {
			checkbox.prop({
				disabled: true,
				indeterminate: false,
				checked: false,
			});
		}
		else if (count === 0) {
			checkbox.prop({
				disabled: false,
				indeterminate: false,
				checked: false,
			});
		}
		else if (numRows === count) {
			checkbox.prop({
				disabled: false,
				indeterminate: false,
				checked: true,
			});
		}
		else {
			checkbox.prop({
				disabled: false,
				indeterminate: true,
				checked: false,
			});
		}
	});
};

// #checkAll {{{2

/**
 * Event handler for using the "check all" checkbox.
 *
 * @param {Event} evt
 * The event generated by the browser when the checkbox is changed.
 */

GridTableGroupDetail.prototype.checkAll = function (evt) {
	var self = this;

	// Synchronize with floating header clone.
	jQuery(evt.target).parents('div.tabletool').find('input[name="checkAll"]').prop('checked', evt.target.checked);

	// Either select or unselect all rows.
	if (evt.target.checked) {
		self.select();
	}
	else {
		self.unselect();
	}
}

// #addDataToCsv {{{2

/**
 * Add all data to the CSV file.  Because plain tables frequently don't show all the data, it's not
 * enough to perform the CSV generation inside the `render()` method like we do with other GridTable
 * implementations.
 *
 * @param {object} data
 */

GridTableGroupDetail.prototype.addDataToCsv = function (data) {
	var self = this;
	var columns = determineColumns(self.colConfig, data, self.typeInfo);

	console.debug('[DataVis // %s // Generate CSV] Started generating CSV file', self.toString());
	self.fire('generateCsvProgress', null, 0);

	self.csv.start();
	self.csv.addRow();

	_.each(data.groupFields, function (fieldName) {
		var fcc = self.colConfig.get(fieldName) || {};
		self.csv.addCol(fcc.displayText || fieldName);
	});
	_.each(_.difference(columns, data.groupFields), function (fieldName) {
		var fcc = self.colConfig.get(fieldName) || {};
		self.csv.addCol(fcc.displayText || fieldName);
	});

	function recur(depth, metadataNode) {
		if (metadataNode.children != null) {
			_.each(_.keys(metadataNode.children).sort(), function (childName) {
				self.csv.addRow();
				for (var j = 0; j < depth; j += 1) {
					self.csv.addCol();
				}
				self.csv.addCol(childName);
				for (var j = depth + 1; j < columns.length; j += 1) {
					self.csv.addCol();
				}
				recur(depth + 1, metadataNode.children[childName]);
			});
		}
		else {
			_.each(metadataNode.rows, function (row) {
				self.csv.addRow();
				for (var j = 0; j < depth; j += 1) {
					self.csv.addCol();
				}
				_.each(_.difference(columns, data.groupFields), function (field, colIndex) {
					var fcc = self.colConfig.get(field) || {};
					var cell = row.rowData[field];
					var value = format(fcc, self.typeInfo.get(field), cell);

					if (value instanceof Element) {
						self.csv.addCol(jQuery(value).text());
					}
					else if (value instanceof jQuery) {
						self.csv.addCol(value.text());
					}
					else if (fcc.allowHtml && self.typeInfo.get(field).type === 'string' && value.charAt(0) === '<') {
						self.csv.addCol(jQuery(value).text());
					}
					else {
						self.csv.addCol(value);
					}
				});
			});
		}
	}

	recur(0, data.groupMetadata);

	self.csv.finish(function () {
		console.debug('[DataVis // %s // Generate CSV] Finished generating CSV file', self.toString());
		self.csvLock.unlock();
		self.fire('generateCsvProgress', null, 100);
		self.fire('csvReady');
	});
};

// Registry {{{1

GridRenderer.registry.set('table_group_detail', GridTableGroupDetail);

// Exports {{{1

export {
	GridTableGroupDetail
};
