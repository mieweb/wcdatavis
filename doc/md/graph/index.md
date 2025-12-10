# Graph

Just like \[grids\]\[Grid\], graphs are bound to views which manage the
data. This means that a graph and grid can show the same data. Graphs
tend to show aggregate values, making them perfect for summarizing data
which has been grouped or pivotted. For this reason, it’s easy to
configure a graph to behave differently depending on how the data has
been organized.

# Graph Renderers

DataVis supports multiple graph rendering libraries, each with their own strengths:

## Google Charts (Default)
- Wide variety of chart types including Gantt charts
- Robust API and extensive configuration options
- Requires internet connection to load Google Charts library

## Chart.js
- Modern, responsive chart library
- Lightweight and fast rendering
- Works offline
- Clean, customizable styling
- Supports animation and interactivity

You can select the renderer when creating a graph:

```javascript
// Using Google Charts (default)
new MIE.WC_DataVis.Graph('graph', computedView, config, {
    title: 'My Graph'
});

// Using Chart.js
new MIE.WC_DataVis.Graph('graph', computedView, config, {
    title: 'My Graph',
    renderer: 'chartjs'
});
```

Alternatively, you can switch renderers using the dropdown in the graph toolbar.

# Graph Types

## Bar / Column Charts

|            |                     |
| ---------- | ------------------- |
| Renderers  | Google, Chart.js    |
| Graph Type | `bar` / `column`    |
| Data Modes | plain, group, pivot |

A bar or column chart shows values plotted as the length of a block
which corresponds to a bucket of data.

### Configuration Options

  - `categoryField` : string (plain mode only)

    Name of the field which gives the category (i.e. “bucket”) of the
    box. In column / vertical graphs, this is the x-axis value; in bar /
    horizontal graphs, this is the y-axis value. The “display text” of
    the corresponding column in the grid overrides the field name in the
    axis label.

  - `valueField` : string (plain mode only)

    Name of the field which determines the size of the box. In column /
    vertical graphs, this is the y-axis value; in bar / horizontal
    graphs, this is the x-axis value. The “display text” of the
    corresponding column in the grid overrides the field name in the
    axis label.

  - `options` : object

    Additional configuration which is passed directly to the renderer.
    For Google Charts, see the [Google Charts
    documentation](https://developers.google.com/chart/interactive/docs/gallery/columnchart#configuration-options)
    for a complete list. For Chart.js, see the [Chart.js
    documentation](https://www.chartjs.org/docs/latest/configuration/).

## Line Charts

|            |                     |
| ---------- | ------------------- |
| Renderers  | Google, Chart.js    |
| Graph Type | `line`              |
| Data Modes | plain, group, pivot |

A line chart shows values as points connected by lines, ideal for showing trends over time or continuous data.

## Pie Charts

|            |                     |
| ---------- | ------------------- |
| Renderers  | Google, Chart.js    |
| Graph Type | `pie`               |
| Data Modes | plain, group, pivot |

A pie chart shows values as slices of a circle, useful for showing proportions of a whole.

### Chart.js Specific Features

When using Chart.js as the renderer, you get additional benefits:

- **Responsive Design**: Charts automatically resize to fit their container
- **Animation**: Smooth animations when data changes or charts load
- **Modern Styling**: Clean, flat design that works well in modern applications
- **Offline Capability**: No external dependencies or internet connection required
- **Performance**: Optimized for fast rendering with large datasets

### Example Usage

```javascript
// Create a Chart.js pie chart with grouped data
var graph = new MIE.WC_DataVis.Graph('myGraph', computedView, {
    whenGroup: {
        graphType: 'pie',
        valueFields: [{
            name: 'Count',
            fun: 'count'
        }]
    }
}, {
    title: 'Sales by Region',
    renderer: 'chartjs'
});
```
