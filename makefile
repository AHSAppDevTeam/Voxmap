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

maps/map.png: maps/map.vox
	### (MANUAL STEP) open in Goxel and export PNG slices
	#
	# PNG slices should have X on the horizontal axis,
	# and Z*(max_Y) + Y on the vertical axis.
	#
	# The official version of Goxel currently does not
	# support exporting PNG slices in that way, and
	# adjusting the orientation using a tool like
	# ImageMagick runs into hardcoded limitations on max image size,
	# so I use a custom version of Goxel at
	# https://github.com/FlyOrBoom/goxel/tree/a906c9e9a2c633f155f13d7854998ced165a08b5,
	# where I open maps/map.vox, adjust the image size to auto-fit,
	# then in exports > PNG slices, select
	# slicing direction = 2
	# laying direction = 1
	# then export.

maps/map.ppm: maps/map.png
	### PNG slices to PAM
	convert maps/map.png -rotate 270 maps/map.ppm

maps/texture.bin: bin/sdf maps/map.ppm
	### PBM to SDF
	# results in a combined SDF + voxel color texture
	bin/sdf

src/map.blob: maps/texture.bin
	### (MANUAL STEP) Encrypt PNG
	# Open encrypt.html
	# Enter encryption key
	# Encrypt image
	# Download
	# Rename file to map.blob
	# And move it to src/

bin/VoxWriter.o:
	clang++ -I libs/MagicaVoxel_File_Writer -Og -g -std=gnu++20 \
		-o bin/VoxWriter.o -c libs/MagicaVoxel_File_Writer/VoxWriter.cpp

bin/vox-pass.o: src/vox-pass.cpp
	clang++ -I libs/MagicaVoxel_File_Writer -Og -g -std=gnu++20 \
		-o bin/vox-pass.o -c src/vox-pass.cpp

bin/vox-reverse.o: src/vox-reverse.cpp
	clang++ -I libs/MagicaVoxel_File_Writer -Og -g -std=gnu++20 \
		-o bin/vox-reverse.o -c src/vox-reverse.cpp

bin/vox: bin/VoxWriter.o bin/vox-pass.o
	clang++ -I. -g -Og -std=gnu++20 -o bin/vox bin/vox-pass.o bin/VoxWriter.o

bin/vox-reverse: bin/VoxWriter.o bin/vox-reverse.o
	clang++ -I. -g -Og -std=gnu++20 -o bin/vox-reverse bin/vox-reverse.o bin/VoxWriter.o

bin/sdf: src/sdf-pass.cpp
	clang++ src/sdf-pass.cpp -g -Og -std=gnu++20 -o bin/sdf

bin/viewer: src/viewer.cpp libs/glad.c
	clang++ src/viewer.cpp libs/glad.c -ldl -lglfw -O3 -o bin/viewer

