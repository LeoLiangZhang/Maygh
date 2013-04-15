#!/bin/sh

# This make.sh file is used to generate application JavaScirpt file by calling minicompiler.py 

APP=app  # Your application JavaScript folder.
FILES=`ls $APP |grep -E 'js$'`  # Will catch all files end with "js" in $APP folder
FLAGS="-t -i src -i lib"        # More includes here

echo "==== Begin at" `date` "===="
for f in $FILES
do

cmd="./tool/minicompiler.py $FLAGS $APP/$f > out/$f"
echo "[$(date)::$f\t]" "$cmd"
eval "$cmd"

done
echo '==== DONE  at' `date` "===="
echo ''
