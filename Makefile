JSDOC := ./node_modules/.bin/jsdoc
SOURCE := $(shell find src -type f -name '*.js')
LANG_PACKS := src/lang/en-US.js src/lang/es-MX.js src/lang/pt-BR.js
DIST_FILES := $(addprefix dist/,wcdatavis.js wcdatavis.min.js wcdatavis.css)
EXAMPLE_FILES := $(patsubst dist/%,examples/%,$(DIST_FILES))
PUB_PATH := zeus.med-web.com:~/public_html/datavis
PYTHON_VER ?= $(shell pyenv versions --bare --skip-aliases --skip-envs | sort -r -V | head -n 1)
.DEFAULT_GOAL := help

.PHONY:	datavis
datavis:	$(DIST_FILES)

# Setup/teardown of dependencies {{{1

.PHONY:	npm-setup
npm-setup:
	@if [[ -f .nvmrc ]] ; then \
		printf '\033[34;1mPlease run `nvm use` to ensure the right version of Node is used.\033[0m\n' ; \
	fi
	npm install
	./bin/update-deps.sh

.PHONY:	npm-teardown
npm-teardown:
	rm -rf node_modules
	rm -rf package-lock.json

.PHONY:	python-setup
python-setup:
    ifeq ($(DOCKER_ENV), 1)
		echo "Running inside Docker"
		pip install --break-system-packages -r requirements.txt
    else
		@if [[ -z "$(PYTHON_VER)" ]] ; then \
			printf '\033[31;1mUnable to find Python versions installed via pyenv.\033[0m\n' ; \
			exit 1 ; \
		fi
		@if pyenv versions --bare | grep '^datavis$$' ; then \
			printf '\033[34;1mRemoving existing "datavis" virtualenv first.\033[0m\n' ; \
			pyenv virtualenv-delete -f datavis ; \
		fi
		@printf '\033[32;1mCreating new "datavis" virtualenv based on Python $(PYTHON_VER).\033[0m\n'
		pyenv virtualenv "$(PYTHON_VER)" datavis
		pyenv local datavis
		pip install -r requirements.txt
    endif



.PHONY:	python-teardown
python-teardown:
	-pyenv virtualenv-delete -f datavis
	-pyenv local --unset

.PHONY:	jsdoc-setup
jsdoc-setup:
	cd third-party/jaguarjs-jsdoc && npm i

.PHONY:	jsdoc-teardown
jsdoc-teardown:
	cd third-party/jaguarjs-jsdoc && rm -rf node_modules

.PHONY:	setup
setup:	npm-setup python-setup
	echo "You should have run git submodule update --init outside the containter"
	git submodule update --init
	$(MAKE) jsdoc-setup

.PHONY:	teardown
teardown:	npm-teardown python-teardown jsdoc-teardown

# Building DataVis {{{1

dist/wcdatavis.js:	rollup.config.js datavis.js third-party/json-formatter.esm.js $(SOURCE) $(LANG_PACKS)
	npm run rollup

dist/wcdatavis.min.js:	dist/wcdatavis.js
	npm run uglify

third-party/json-formatter.esm.js:
	cd third-party/json-formatter-js && npm i && npm run build
	cp third-party/json-formatter-js/dist/$(notdir $@) $@

# Documentation {{{1

.PHONY:	doc
doc:	jsdoc mkdocs
	@printf '\033[32;1mRun `make doc-publish` to publish documentation to $(PUB_PATH)\033[0m\n'

.PHONY:	doc-publish
doc-publish:	doc
	rsync -a --delete doc/html/ $(PUB_PATH)/manual/
	rsync -a --delete jsdoc/ $(PUB_PATH)/jsdoc/
	$(MAKE) -C tests $@

.PHONY:	doc-clean
doc-clean:
	rm -rf doc/html
	rm -rf jsdoc
	$(MAKE) -C tests $@

.PHONY:	doc-serve
doc-serve:
	mkdocs serve

.PHONY:	jsdoc
jsdoc:
	$(JSDOC) -p -c jsdoc_conf.json -r src
	$(MAKE) -C tests $@

.PHONY:	mkdocs
mkdocs:
	mkdocs build

.PHONY:	publish
publish:	doc-publish tests-publish

# Testing {{{1

.PHONY:	serve
serve:
ifdef PORT
	/usr/bin/env PORT=$(PORT) python bin/data-server.py
else
	python bin/data-server.py
endif

tests:	$(DIST_FILES)
	$(MAKE) -C tests

.PHONY:	tests-publish
tests-publish:	tests
	rsync -av --delete tests/pages/ $(PUB_PATH)/examples/

.PHONY:	test
test:	tests
	npm run test

examples:	tests $(EXAMPLE_FILES)
	cp tests/data/*.json examples/test

$(EXAMPLE_FILES):examples/%:	dist/%
	cp $^ $@

# Cleanup {{{1

.PHONY:	dist-clean
dist-clean:
	rm -f dist/wcdatavis.js dist/wcdatavis.min.js
	rm -f src/lang/*.js
	rm -f $(EXAMPLE_FILES)
	rm -f examples/test/*.json

.PHONY:	clean
clean:	doc-clean dist-clean
	$(MAKE) -C tests $@

# Translations {{{1

src/lang/en-US.js:	en-US.tsv trans.tsv
	rm -rf trans-missing
	mkdir -p trans-missing
	-gawk -f ./bin/make-lang-packs.awk $^

trans.tsv:
	touch $@

# Miscellaneous {{{1

.PHONY:	tags
tags:
	ctags -R -f TAGS --languages=JavaScript --sort=foldcase src

# Help {{{1

.PHONY:	help
help:
	@printf -- '\033[36;1mImportant targets:\033[0m\n'
	@printf -- '\n'
	@printf -- '- \033[1mmake setup\033[0m — Installs all dependencies.\n'
	@printf -- '- \033[1mmake datavis\033[0m — Build the compressed DataVis JS and CSS files.\n'
	@printf -- '- \033[1mmake tests\033[0m — Same as \033[1mmake datavis\033[0m, then copy to tests directory, and build test data.\n'
	@printf -- '- \033[1mmake serve\033[0m — Start local server for interactive testing.\n'
	@printf -- '- \033[1mmake test\033[0m — Same as \033[1mmake tests\033[0m, then run automated tests using Mocha & Selenium.\n'
	@printf -- '- \033[1mmake doc\033[0m — Build all documentation.\n'
	@printf -- '  - \033[1mmake jsdoc\033[0m — Build JS API documentation from comments in the source.\n'
	@printf -- '  - \033[1mmake mkdocs\033[0m — Build the Manual from Markdown files.\n'
