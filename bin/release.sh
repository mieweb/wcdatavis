#!/usr/bin/env bash

set -e -u -o pipefail

errmsg() {
    echo -e "$@" >&2
}

usage() {
    errmsg "USAGE: $0 VERSION"
    errmsg "       $0 -c / --continue"
    errmsg "       $0 -a / --abort"
    errmsg ""
    errmsg "Create a DataVis release of the currently checked-out code for VERSION."
    errmsg "If tests fail, use -c / --continue to commit, tag, and push later."
}

getopt() {
    if [[ $(uname) = 'Darwin' && -x /usr/local/opt/gnu-getopt/bin/getopt ]] ; then
        /usr/local/opt/gnu-getopt/bin/getopt "$@"
    else
        getopt "$@"
    fi
}

commit_tag_push() {
    local version="$1" ; shift
    git commit -m "Release: DataVis v$version" package.json package-lock.json
    git push origin
    git push github
    git tag -m "DataVis v$version" "v$version"
    git push origin tag "v$version"
    git push github tag "v$version"
}

update_package_json() {
    local version="$1" ; shift
    if [[ ! ( $version =~ [0-9]+\.[0-9]+\.[0-9]+ ) ]] ; then
        errmsg "Invalid version: $version"
        exit 1
    fi
    mv package.json package.json.bak
    jq '.version = "'"$version"'"' < package.json.bak > package.json
    rm package.json.bak
    npm install
    if [[ "$run_tests" = 1 ]]; then
        make clean
        make teardown
        make setup
        make tests
        make test || {
            read -p 'Tests failed... continue? (yes/no) '
            if [[ "$REPLY" != 'yes' ]] ; then
                echo "$version" > .release-version
                errmsg 'Fix any issues, then rerun with --continue.'
                exit 1
            fi
        }
    fi
    commit_tag_push "$version"
}

main() {
    OPTIONS=$(getopt --options='ach' --longoptions='abort,continue,no-test,help' --name="$0" -- "$@")
    run_tests=1
    if [ $? -ne 0 ]; then
        errmsg 'Error parsing arguments'
        exit 1
    fi
    eval set -- "$OPTIONS"
    while true ; do
        case "$1" in
        -a|--abort)
            shift
            rm -f .release-version
            errmsg 'Not implemented'
            exit 1
            ;;
        -c|--continue)
            shift
            if [[ ! -r .release-version ]] ; then
                errmsg 'Missing .release-version file.'
                exit 1
            fi
            read version < .release-version
            commit_tag_push "$version"
            exit 0
            ;;
        --no-test)
            shift
            run_tests=0
            ;;
        -h|--help)
            shift
            usage
            exit 1
            ;;
        --)
            shift
            break
        esac
    done
    if [[ $# -ne 1 ]] ; then
        usage
        exit 1
    fi
    update_package_json "$@"
}

main "$@"
