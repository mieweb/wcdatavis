# Getting Started

## Building

This project can be built using Make.

```
$ make setup
$ make datavis

$ make tests
$ make serve
```

Make is also used to generate documentation, build & run tests, and other stuff.  See the [Development section](development/index.md) for lots more information about pre-requisites, building DataVis, and running the local data server.

## Installation

Copy the JS and CSS files from the `dist` directory and include them in your page.

## Runtime Dependencies

There are no JavaScript runtime dependencies. Everything is now bundled within the `wcdatavis.js` file. When using DataVis as a dependency from NPM, simply import it.

### CSS Dependencies

The following CSS files are still required to use DataVis:

* jQuery UI
* BlockUI
* contextMenu
* SumoSelect
* FlatPickr
* Font Awesome

Here's some HTML you can adapt to get the external dependencies.

``` html
<script src="wcdatavis.js"></script>

<link rel="stylesheet" href="font-awesome.css"/>
<link rel="stylesheet" href="jquery-ui.css"/>
<link rel="stylesheet" href="contextMenu.css"/>
<link rel="stylesheet" href="sumoselect.css"/>
<link rel="stylesheet" href="flatpickr.css"/>

<link rel="stylesheet" href="wcdatavis.css"/>
```

## Basic Concepts

At the bare minimum, you need to create three objects:

- An instance of `Source` to retrieve data.
- An instance of `View` to perform operations like group and sort.
- An instance of `Grid` to display the results.

## Direct Browser Usage

```html
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8"/>
		<script src="../wcdatavis.js"></script>
		<link rel="stylesheet" href="../font-awesome.css"/>
		<link rel="stylesheet" href="../jquery-ui.min.css"/>
		<link rel="stylesheet" href="../jquery.contextMenu.min.css"/>
		<link rel="stylesheet" href="../sumoselect.min.css"/>
		<link rel="stylesheet" href="../flatpickr.min.css"/>
		<link rel="stylesheet" href="../wcdatavis.css"/>
		<script>
document.addEventListener('DOMContentLoaded', function () {
	var source = new MIE.WC_DataVis.Source({
		type: 'http',
		url: '../random100.json'
	});
	var computedView = new MIE.WC_DataVis.ComputedView(source);
	new MIE.WC_DataVis.Grid({
		id: 'grid',
		computedView: computedView
	}, {title: 'Test Grid'});
});
		</script>
	</head>
	<body>
		<div id="grid"></div>
	</body>
</html>
```

## Node Project

### Package File

```javascript
{
  "name": "datavis-example",
  "version": "1.0.0",
  "description": "Example of how to use DataVis",
  "license": "UNLICENSED",
  "author": "Taylor Venable <tvenable@mieweb.com>",
  "scripts": {
    "rollup": "rollup --bundleConfigAsCjs -c rollup.config.js",
  },
  "dependencies": {
    "wcdatavis": "git+ssh://git@github.com:mieweb/wcdatavis.git"
  },
  "devDependencies": {
    "@babel/core": "=7.24.9",
    "@babel/preset-env": "=7.24.8",
    "@rollup/plugin-babel": "=6.0.4",
    "@rollup/plugin-commonjs": "=25.0.7",
    "@rollup/plugin-node-resolve": "=15.2.3",
    "rollup": "=4.9.6"
  }
}
```

### Rollup Config

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';

export default {
	input: 'index.js',
	output: {
		file: 'dist/index.js',
		format: 'iife',
		globals: {
			fs: 'undefined',
			stream: 'undefined',
		}
	},
	plugins: [resolve(), commonjs(), babel({ babelHelpers: 'bundled' })]
};
```

### JavaScript File

```javascript
import {
  Source,
  ComputedView,
  Grid,
} from 'wcdatavis';

document.addEventListener('DOMContentLoaded', function () {
  var source = new Source({
    type: 'http',
    url: 'fruit.csv'
  });
  var computedView = new ComputedView(source);
  new Grid({
    id: 'grid',
    computedView: computedView
  }, {title: 'DataVis NPM Example'});
});

```

### HTML File

```html
<!DOCTYPE html>
<html>
	<head>
		<title>DataVis Example</title>
		<meta charset="utf-8"/>
		<script src="../dist/index.js"></script>
		<link rel="stylesheet" href="../font-awesome.css"/>
		<link rel="stylesheet" href="../jquery-ui.min.css"/>
		<link rel="stylesheet" href="../jquery.contextMenu.min.css"/>
		<link rel="stylesheet" href="../sumoselect.min.css"/>
		<link rel="stylesheet" href="../flatpickr.min.css"/>
		<link rel="stylesheet" href="../node_modules/wcdatavis/dist/wcdatavis.css"/>
	</head>
	<body>
		<div id="grid"></div>
	</body>
</html>
```

