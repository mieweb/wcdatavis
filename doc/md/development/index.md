# Development

## Managing Branches

DataVis has three different kinds of branches:

- **development** (`master`): Mostly stable and fully merged branch.  Eventually this will become the next major release.

- **stable** (e.g. `v1`, `v2`): Stable and released version of DataVis.  Only minor enhancements and bug fixes are allowed.  Hereafter, just called the "stable" branch, although there is one for each major release.

- **feature** (e.g. `server_limit`, `mirage`): Feature branches are for active development where you want to commit stuff that doesn't fully work yet.

How do you know where changes should go?

* For bug fixes, commit into the stable branch and merge to `master`.
* For minor new features and refactoring, commit into `master` and merge into stable when they're well tested.
* For major new features, commit to a feature branch, merging from `master` to keep up-to-date.  When done, merge info `master` and delete the feature branch.

### Tips for Switching Branches

Always, *always* do the following:

- `make teardown`
- `make setup`

This ensures that all dependencies are fully wiped out and rebuilt for the current branch.  You may also get a message about running `nvm use` — that means a specific version of Node is required for the support code.

## Conventions

The number one convention is to avoid making unnecessary diffs.  Follow the style of what's already there, in the area near where you're making a change.  This overrides all other recommendations.

### Formatting Standards

* Code is indented with tabs. Each tab is 2 visual spaces.
* Don't [cuddle your else keywords](http://wiki.c2.com/?CuddledElseBlocks).
* Combine declarations for variables without initializers; use separate declarations for variables with initializers.

### General Guidelines

* Maintain compatibility with IE10.  I know, this sucks.
* If you're going to potentially call another function with the same arguments, use `var args = Array.prototype.slice.call(arguments)` and apply the function call to `args`.
* Check arguments at the start of a function.  For example, does an argument need to be a function?  Make sure that it is.  The point is to throw an exception as early as possible for any developer mistakes.
* After checking argument validity, set any default values for variables, or defaults for keys in an object.
* Don't use `console` methods directly.  Use `log` for normal console messages, `debug` for debugging messages, and `logAsync()` for logging asynchronous stuff (i.e. JS thread yields).
* Use exceptions liberally for unrecoverable situations, like `throw new Error('...')`.  This makes mistakes easier to catch because they're obvious as we're testing.
* For recoverable errors (i.e. "you asked for that but I know that's wrong so I'm going to do this instead so things are still usable") log an error to the console with `log.error()`.
* For things that are wrong but not going to break anything, use `log.warn()`.

!!! important
    Again, it's really important that we maintain compatibility with IE10.  That means no arrow functions, no template strings, no destructuring, no classes or modules.

### Object Orientation

* The first line of any method should be `var self = this`.
* Never use `this` unless within an event handler or something like that.  Always use `self` to refer to the instance that the method is being invoked on.
* Use `makeSubclass` to create class hierarchies.  Toplevel classes should have `Object` as their superclass.
* Use `self.super` to access methods in superclasses.

## Pre-Requisites

The DataVis support tooling is written in both JavaScript and Python.  For the latter, I recommend setting up a virtualenv using the latest stable Python 3 release first.  Then you can run the following to get all the required packages.


### MacOS

```
brew install pyenv pyenv-virtualenv node
xcode-select --install
```

### After installing packages

then run

```
$ make setup
```

!!! help "Installing Node with `nvm`"

    See instructions [on the NVM GitHub repository](https://github.com/nvm-sh/nvm#installing-and-updating).

!!! help "Setting up a Python virtualenv for DataVis"

    1. [install pyenv](https://github.com/pyenv/pyenv#installation)
    2. [install the virtualenv plugin](https://github.com/pyenv/pyenv-virtualenv#installation)
    3. Install an appropriate version of Python and make a virtualenv for your DataVis work.
       ```
       [wcdatavis] $ pyenv install 3.10.1
       [wcdatavis] $ pyenv virtualenv 3.10.1 datavis
       [wcdatavis] $ pyenv local datavis
       ```

## Compiling

After installing the [Pre-Requisites](#pre-requisites), run `make datavis` to build the JS and CSS files for DataVis.  You can also run `make tests` to (1) build and copy the JS and CSS files to `tests/pages`, and (2) generate the data files needed for testing.  See [Building Test Data](#building-test-data) below.

## Running the Local Server

By running the local HTTP server, you can easily get to the documentation and test pages as you work on the code.  It runs on port 5000 and can be started with `make serve`.  Here are some links for useful stuff, once you get it running:

- [DataVis JS API Docs](http://localhost:5000/jsdoc/index.html)
- [DataVis Manual](http://localhost:5000/doc/html/index.html)
- [Testing Library JS API Docs](http://localhost:5000/tests/jsdoc/index.html)
- [Grid Test Pages](http://localhost:5000/tests/pages/grid/)

!!! note
    By default, the local HTTP server uses port 5000 but your computer may already be using that port for something else.  In that case, you'll see a warning in the console, along with what port it used instead; adjust the previously listed URLs accordingly.
