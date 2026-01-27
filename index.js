import jQuery from 'jquery';

// Don't try to inline this code, it won't work. Imports are lifted,
// and this code needs to run before we import jQuery UI. Yes, this
// is an unhinged workaround.

import original_jQuery from './global-jquery.js';

import 'block-ui';
import 'flatpickr';
import 'jquery-ui/dist/jquery-ui.min.js';
import 'jquery-contextmenu';
import 'sumoselect';

import { ParamInput } from './src/source_param.js';
import { Source } from './src/source.js';
import { ComputedView } from './src/computed_view.js';
import { Grid } from './src/grid.js';
import { Graph } from './src/graph.js';
import { Prefs } from './src/prefs.js';
import { Perspective } from './src/perspective.js';

// We left the global jQuery around long enough for jQuery UI to install itself, and that same
// jQuery object has been used by all other plugins and DataVis code.  Now that we're all done,
// make it so nobody can access our jQuery, to avoid conflicts.
//
// Note: We use Reflect.deleteProperty instead of the delete operator because Rspack's
// ProvidePlugin transforms `window.jQuery` into a variable identifier, and using `delete`
// on an identifier is illegal in strict mode.

if (original_jQuery != null) {
  window.jQuery = original_jQuery;
}
else {
  Reflect.deleteProperty(window, 'jQuery');
}

export {
  Source,
  ParamInput,
  ComputedView,
  Prefs,
  Perspective,
  Grid,
  Graph
};
