#!/usr/bin/env python3

import os
import os.path

from babel.dates import format_date, format_datetime, format_time
from babel.numbers import format_decimal
from datetime import date, datetime, time

import copy
import csv
import decimal
import gzip
import json
import random
import re
import time
import sys
import inspect
import argparse

import json5
import dicttoxml
import xml.dom.minidom

script_dir = os.path.dirname(os.path.realpath(__file__))

WORDS = []
with gzip.open(os.path.join(script_dir, 'words.gz'), 'rt') as h:
    WORDS = h.read().splitlines()

STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming']
LIPSUM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
RANDOMS = {}
RANDOM_SEED = { 'seed': None }
LAST = {}
BLANK_CHANCE = { 'chance': 0 }
NULL_CHANCE = { 'chance': 0 }

def init_random(name=None):
    if name == None:
        name = inspect.stack()[1].frame.f_code.co_name
    if name not in RANDOMS:
        RANDOMS[name] = random.Random()
        if RANDOM_SEED['seed'] != None:
            RANDOMS[name].seed(RANDOM_SEED['seed'])
    return RANDOMS[name]

def clamp(val, low, high):
    return max(min(val, high), low)

def random_int(name='random_int', min=0, max=100, **opts):
    global LAST
    r = init_random(name)
    val = r.randint(min, max)
    if opts.get('output_type') == 'string':
        if 'format' in opts:
            ret = format_decimal(val, format=opts['format'], locale=opts.get('locale', 'en_US'))
        else:
            ret = str(val)
    else:
        ret = val
    LAST[name] = ret
    return ret

def random_float(name='random_float', min=0, max=1, **opts):
    global LAST
    r = init_random(name)
    val = r.uniform(min, max)
    if opts.get('output_type') == 'string':
        if 'format' in opts:
            ret = format_decimal(val, format=opts['format'], locale=opts.get('locale', 'en_US'))
        elif 'fixed' in opts:
            ret = str(decimal.Decimal(val).quantize(decimal.Decimal('1.' + ('0' * opts['fixed']))))
        else:
            ret = str(val)
    else:
        if 'fixed' in opts:
            ret = float(decimal.Decimal(val).quantize(decimal.Decimal('1.' + ('0' * opts['fixed']))))
        else:
            ret = val
    LAST[name] = ret
    return ret

def random_date(name='random_date', min='1900-01-01', max='2100-01-01', **opts):
    global LAST
    r = init_random(name)
    min = int(time.mktime(time.strptime(min, '%Y-%m-%d')))
    max = int(time.mktime(time.strptime(max, '%Y-%m-%d')))
    val = date.fromtimestamp(r.randint(min, max))
    if 'format' in opts:
        ret = format_date(val, opts['format'], locale=opts.get('locale', 'en_US'))
    else:
        ret = str(val)
    LAST[name] = ret
    return ret

def random_time(name='random_time', min='00:00:00', max='23:59:59', **opts):
    global LAST
    r = init_random(name)
    min = int(time.mktime(time.strptime('2000-01-01 ' + min, '%Y-%m-%d %H:%M:%S')))
    max = int(time.mktime(time.strptime('2000-01-01 ' + max, '%Y-%m-%d %H:%M:%S')))
    val = datetime.fromtimestamp(r.randint(min, max))
    if 'format' in opts:
        ret = format_datetime(val, opts['format'], locale=opts.get('locale', 'en_US'))
    else:
        ret = format_datetime(val, 'HH:mm:ss', locale=opts.get('locale', 'en_US'))
    LAST[name] = ret
    return ret

def random_datetime(name='random_datetime', min='1900-01-01 00:00:00', max='2099-12-31 23:59:59', **opts):
    global LAST
    r = init_random(name)
    min = int(time.mktime(time.strptime(min, '%Y-%m-%d %H:%M:%S')))
    max = int(time.mktime(time.strptime(max, '%Y-%m-%d %H:%M:%S')))
    val = datetime.fromtimestamp(r.randint(min, max))
    if 'format' in opts:
        ret = format_datetime(val, opts['format'], locale=opts.get('locale', 'en_US'))
    else:
        ret = str(val)
    LAST[name] = ret
    return ret

def random_duration(name='random_duration', format='{y}y {d}d {h}h {m}m {s}s {t}t {u}u', **opts):
    global LAST
    r = init_random(name)
    o = { 'y': r.randint(0, 999),
          'd': r.randint(0, 364),
          'h': r.randint(0, 23),
          'm': r.randint(0, 59),
          's': r.randint(0, 59),
          't': r.randint(0, 999),
          'u': r.randint(0, 999) }
    ret = format.format_map(o)
    LAST[name] = ret
    return ret

def random_element(name, set, dist='uniform'):
    global LAST
    r = init_random(name)
    if dist == 'triangular':
        i = round(r.triangular(0, len(set) - 1))
    elif dist == 'normal':
        mu = len(set)/2.0 - 0.5
        sigma = len(set)/6.0 # three std dev on each side, close enough
        i = clamp(round(r.normalvariate(mu, sigma)), 0, len(set) - 1)
    else:
        i = round(r.uniform(0, len(set) - 1))
    ret = set[i]
    LAST[name] = ret
    return ret

def word_dict(name='word_dict'):
    global LAST
    r = init_random(name)
    ret = WORDS[r.randint(0, len(WORDS))]
    LAST[name] = ret
    return ret

def state(name='state'):
    global LAST
    r = init_random(name)
    ret = r.choice(STATES)
    LAST[name] = ret
    return ret

def random_seed(n):
    # print('Setting random seed: {}'.format(n), file=sys.stderr)
    RANDOM_SEED['seed'] = n

def blank_chance(c):
    # print('Setting blank chance: {}'.format(c), file=sys.stderr)
    BLANK_CHANCE['chance'] = c

def null_chance(c):
    # print('Setting null chance: {}'.format(c), file=sys.stderr)
    NULL_CHANCE['chance'] = c

def repeat(times, val):
    if isinstance(times, str):
        times = int(times)
    result = []
    for i in range(times):
        if i % 100 == 0:
            if i > 0: print(' ... ', end='', file=sys.stderr)
            print(i, end='', file=sys.stderr, flush=True)
        result.append(process(copy.deepcopy(val)))
    print(' ...', i, '[DONE]', file=sys.stderr, flush=True)
    return result

CYCLE = {}
def cycle(name, lst):
    global CYCLE, LAST
    if name in CYCLE:
        c = CYCLE[name]
        c['index'] += 1
        if c['index'] >= len(c['list']):
            c['index'] = 0
        ret = c['list'][c['index']]
    else:
        CYCLE[name] = { 'index': 0, 'list': lst }
        ret = lst[0]
    LAST[name] = ret
    return ret

SEQUENCE = {}
def sequence(name, start=1):
    global SEQUENCE, LAST
    if name in CYCLE:
        CYCLE[name] += 1
    else:
        CYCLE[name] = start
    ret = CYCLE[name]
    LAST[name] = ret
    return ret

def lipsum(count = 1):
    return ' '.join([LIPSUM] * count)

def last(name):
    global LAST
    return LAST[name]

def process(node):
    env = { 'random_int': random_int,
            'random_float': random_float,
            'random_date': random_date,
            'random_time': random_time,
            'random_datetime': random_datetime,
            'random_duration': random_duration,
            'random_element': random_element,
            'repeat': repeat,
            'word_dict': word_dict,
            'choice': random.choice,
            'state': state,
            'cycle': cycle,
            'sequence': sequence,
            'lipsum': lipsum,
            'last': last,
            'RANDOM_SEED': RANDOM_SEED,
            'BLANK_CHANCE': BLANK_CHANCE,
            'NULL_CHANCE': NULL_CHANCE }
    r = re.compile(r'\$<\s*(.*?)\s*>\$')
    def recur(node):
        if type(node) is dict:
            for key, val in node.items():
                if val == None:
                    # The JSON value is null, so this key is evaluated for side effects.  This is
                    # used e.g. for random_seed() and blank_chance().
                    match = r.fullmatch(key)
                    if match:
                        eval(match.group(1))
                        del node[key]
                        return recur(node)
                node[key] = recur(val)
        elif type(node) is list:
            index = 0
            while index < len(node):
                if index+1 < len(node) and type(node[index]) is str and type(node[index+1]) is dict:
                    # We're probably looking at:
                    #   [ "$< repeat(X, Y) >$", { ... }, ... ]
                    match = r.fullmatch(node[index])
                    if match:
                        env['ARGS'] = args.args
                        env['VALUE'] = node[index+1]
                        node[index:index+2] = eval(match.group(1), env)
                    else:
                        node[index] = recur(node[index])
                else:
                    node[index] = recur(node[index])
                index += 1
        elif type(node) is str:
            match = r.fullmatch(node)
            if match:
                val = eval(match.group(1), env)
                if BLANK_CHANCE['chance'] > 0:
                    init_random('__BLANK_CHANCE')
                    if random_float('__BLANK_CHANCE') < BLANK_CHANCE['chance']:
                        return ''
                if NULL_CHANCE['chance'] > 0:
                    init_random('__NULL_CHANCE')
                    if random_float('__NULL_CHANCE') < NULL_CHANCE['chance']:
                        return None
                return val
        return node
    return recur(node)

def parse(input, output):
    obj = json5.load(input)
    process(obj)
    if args.format == 'json':
        json.dump(obj, output, indent=2)
    elif args.format == 'csv':
        writer = csv.DictWriter(output, [fti['field'] for fti in obj['typeInfo']])
        writer.writeheader()
        writer.writerows(obj['data'])
    elif args.format == 'xml':
        newTypeInfo = {}
        for fti in obj['typeInfo']:
            newTypeInfo[fti['field']] = fti
        obj['typeInfo'] = newTypeInfo
        xmlString = dicttoxml.dicttoxml(obj, attr_type = False)
        dom = xml.dom.minidom.parseString(xmlString)
        print(dom.toprettyxml(), file=output)

class DefineAction(argparse.Action):
    def __init__(self, option_strings, dest, nargs=None, **kwargs):
        if nargs is not None:
            raise ValueError("nargs not allowed")
        super(DefineAction, self).__init__(option_strings, dest, **kwargs)
    def __call__(self, parser, namespace, values, option_string=None):
        values = values.split('=', 1)
        if getattr(namespace, self.dest) == None:
            setattr(namespace, self.dest, {})
        getattr(namespace, self.dest)[values[0]] = values[1]

cliArgsParser = argparse.ArgumentParser(description='Generate JSON test files')
cliArgsParser.add_argument('-D', action=DefineAction, dest='args')
cliArgsParser.add_argument('-f', action='store', dest='format', default='json')
args = cliArgsParser.parse_args()

parse(sys.stdin, sys.stdout)
