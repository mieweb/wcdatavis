import jQuery from 'jquery';

// Don't try to inline this code, it won't work. Imports are lifted,
// and this code needs to run before we import jQuery UI. Yes, this
// is an unhinged workaround.

import original_jQuery from './global-jquery.js';

import 'block-ui';
import 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import 'jquery-ui/dist/jquery-ui.min.js';
import 'jquery-contextmenu';
import 'sumoselect';

import 'jquery-ui/dist/themes/base/jquery-ui.min.css';
import 'jquery-contextmenu/dist/jquery.contextMenu.min.css';
import 'sumoselect/sumoselect.min.css';
import './wcdatavis.css';

import * as Util from './src/util/misc.js';
import OrdMap from './src/util/ordmap.js';
import Lock from './src/util/lock.js';
import { Aggregate, AGGREGATE_REGISTRY } from './src/aggregates.js';
import { ParamInput } from './src/source_param.js';
import { Source } from './src/source.js';
import { ComputedView } from './src/computed_view.js';
import { MirageView } from './src/mirage_view.js';
import { GroupFunction, GROUP_FUNCTION_REGISTRY } from './src/group_fun.js';
import { Grid } from './src/grid.js';
import { Graph } from './src/graph.js';
import { Prefs } from './src/prefs.js';
import { Perspective } from './src/perspective.js';
import { PrefsBackend, PREFS_BACKEND_REGISTRY } from './src/prefs_backend.js';
import { PrefsModule, PrefsModuleGrid, PREFS_MODULE_REGISTRY } from './src/prefs_module.js';
import { trans } from './src/trans.js';

// So we only import Svelte-Gantt when we're building an IIFE via Rollup.  This is mainly because
// Meteor + Svelte 4 + Typescript isn't working, so it had to be removed from the main code.

import GraphRendererSvelteGantt from './src/renderers/graph/svelte-gantt.js';
import GRAPH_RENDERER_REGISTRY from './src/reg/graph_renderer.js';

GRAPH_RENDERER_REGISTRY.set('svelte-gantt', GraphRendererSvelteGantt);

// Set some global variables for <script> tag usage.

window.MIE              = window.MIE || {};
window.MIE.log          = Util.log;
window.MIE.debug        = Util.debug;
window.MIE.OrdMap       = OrdMap;
window.MIE.Lock         = Lock;
window.MIE.trans        = trans;
window.MIE.makeSubclass = Util.makeSubclass;

window.MIE.WC_DataVis                 = window.MIE.WC_DataVis || {};
window.MIE.WC_DataVis.Aggregate       = Aggregate;
window.MIE.WC_DataVis.ParamInput      = ParamInput;
window.MIE.WC_DataVis.Source          = Source;
window.MIE.WC_DataVis.GroupFunction   = GroupFunction;
window.MIE.WC_DataVis.ComputedView    = ComputedView;
window.MIE.WC_DataVis.MirageView      = MirageView;
window.MIE.WC_DataVis.Grid            = Grid;
window.MIE.WC_DataVis.grids           = {};
window.MIE.WC_DataVis.Graph           = Graph;
window.MIE.WC_DataVis.graphs          = {};
window.MIE.WC_DataVis.Perspective     = Perspective;
window.MIE.WC_DataVis.Prefs           = Prefs;
window.MIE.WC_DataVis.PrefsBackend    = PrefsBackend;
window.MIE.WC_DataVis.PrefsModule     = PrefsModule;
window.MIE.WC_DataVis.PrefsModuleGrid = PrefsModuleGrid;
window.MIE.WC_DataVis.EXPORT_URL      = 'export.php';

// Expose "registry" extension points

window.MIE.WC_DataVis.AGGREGATE_REGISTRY      = AGGREGATE_REGISTRY;
window.MIE.WC_DataVis.GROUP_FUNCTION_REGISTRY = GROUP_FUNCTION_REGISTRY;
window.MIE.WC_DataVis.PREFS_BACKEND_REGISTRY  = PREFS_BACKEND_REGISTRY;
window.MIE.WC_DataVis.PREFS_MODULE_REGISTRY   = PREFS_MODULE_REGISTRY;

window.MIE.WC_DataVis.Util                    = Util;

// We left the global jQuery around long enough for jQuery UI to install itself, and that same
// jQuery object has been used by all other plugins and DataVis code.  Now that we're all done,
// make it so nobody can access our jQuery, to avoid conflicts.

window.MIE.WC_DataVis.jQuery = jQuery;

if (original_jQuery != null) {
	window.jQuery = original_jQuery;
}
else {
	delete window.jQuery;
}
