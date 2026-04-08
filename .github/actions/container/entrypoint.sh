#!/usr/bin/env bash

main() {
	cd /github/workspace

	case "$1" in
		build-docs)
			make setup
			make doc
		;;
		build-examples)
			make setup
			make datavis
			make tests
		;;
		bash)
			/bin/bash
		;;
		*)
			echo "Warning command $1.  I just you want the command to run?"
			echo "Usage: build-docs | build-examples | bash"
			exec "$@"
	esac
}

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"

eval "$(pyenv init --path)"
eval "$(pyenv virtualenv-init -)"

main "$@"
