#!/bin/bash

PLUGINS=$(ionic cordova plugin list | awk '{print $1}')

for PLUGIN in $PLUGINS; do
    ionic cordova plugin rm $PLUGIN --save && ionic cordova plugin add $PLUGIN --save
done
