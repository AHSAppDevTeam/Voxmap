.PHONY: all clean

all: src/map.blob

maps/map.csv:
	### (MANUAL STEP) data collection

maps/map.svg: maps/map.csv
	### rough location maps to SVG
	python3 src/csv-pass.py

maps/old.map.ora: maps/map.svg
	### SVG to rastered Krita file containing depth and edges
	mkdir -p maps/ora/maps
	# rasterize depth map
	convert -flip +antialias maps/map.svg maps/ora/data/layer0.png
	# get edges
	convert -threshold 0 -edge 1 +antialias maps/ora/data/layer0.png maps/ora/data/layer1.png
	# zip into .ora
	cd maps/ora && zip -r map.ora * && cd ..
	mv maps/ora/map.ora maps/out.map.ora

maps/map.ora:
	### (MANUAL STEP) clean up data in Krita

maps/map.pgm: maps/map.ora
	### Krita file to easily-parsable greyscale PGM
	unzip -o maps/map.ora -d maps/ora
	mogrify -format pgm -flip maps/ora/data/*.png
	mkdir -p maps/pgm
	mv maps/ora/data/*.pgm maps/pgm
	touch maps/pgm/*.pgm

maps/map.vox: bin/vox maps/map.pgm
	### PGM to 3D MagicaVoxel volume
	bin/vox

maps/map.txt: maps/map.vox
	### MagicaVoxel to Goxel text format
	### x y z RRGGBB
	goxel maps/map.vox --export maps/map.txt

maps/texture.bin: bin/sdf maps/map.txt
	### PBM to SDF
	# results in a combined SDF + voxel color texture
	bin/sdf

maps/texture.bin.gz: maps/texture.bin
	gzip -f maps/texture.bin

src/map.blob: maps/texture.bin.gz
	### Encrypt PNG
	node src/encrypt.js

cppflags = -O3 -g -std=c++20 -Ilibs/MagicaVoxel_file_writer -Ilibs/OpenSimplexNoise -I.

bin/OpenSimplexNoise.o:
	clang++ $(cppflags) -o bin/OpenSimplexNoise.o -c libs/OpenSimplexNoise/OpenSimplexNoise/OpenSimplexNoise.cpp

bin/VoxWriter.o:
	clang++ $(cppflags) -o bin/VoxWriter.o -c libs/MagicaVoxel_File_Writer/VoxWriter.cpp

bin/vox-pass.o: src/vox-pass.cpp
	clang++ $(cppflags) -o bin/vox-pass.o -c src/vox-pass.cpp

bin/vox-reverse.o: src/vox-reverse.cpp
	clang++ $(cppflags) -o bin/vox-reverse.o -c src/vox-reverse.cpp

bin/vox: bin/VoxWriter.o bin/vox-pass.o
	clang++ $(cppflags) -o bin/vox bin/vox-pass.o bin/VoxWriter.o

bin/vox-reverse: bin/VoxWriter.o bin/vox-reverse.o
	clang++ $(cppflags) -o bin/vox-reverse bin/vox-reverse.o bin/VoxWriter.o

bin/sdf-pass.o: src/sdf-pass.cpp
	clang++ $(cppflags) -o bin/sdf-pass.o -c src/sdf-pass.cpp

bin/sdf: bin/sdf-pass.o bin/OpenSimplexNoise.o
	clang++ $(cppflags) -o bin/sdf bin/sdf-pass.o bin/OpenSimplexNoise.o

bin/viewer: src/viewer.cpp libs/glad.c
	clang++ src/viewer.cpp libs/glad.c -ldl -lglfw $(cppflags) -o bin/viewer
