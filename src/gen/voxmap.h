#include <tbb/blocked_range3d.h>
#include <tbb/parallel_for.h>
#include <tbb/tbb.h>
#include <iostream>

const int X = 1024;
const int Y = 256;
const int Z = 32;
const int CHUNK = Z;

const int LEN[3] = {X, Y, Z};
const int AREA[3] = {Y * Z, X *Z, X *Y};

const int N_dots = 32;
const int N_pixels = X*Y;
const int N_voxels = X*Y*Z;
const int N_chunks = X*Y*Z/CHUNK/CHUNK/CHUNK;

void parXY(auto function) {
  auto sec_order = [&](int i){
    auto x = i % X;
    auto y = i / X;
    function(x, y);
  };
  tbb::parallel_for(0, N_pixels, sec_order);
}
void parXYZ(auto function) {
  auto sec_order = [&](int i){
    auto x = i % X;
    auto y = i / X % Y;
    auto z = i / X / Y;
    function(x, y, z);
  };
  tbb::parallel_for(0, N_voxels, sec_order);
}
void parChunkXYZ(auto function) {
  auto sec_order = [&](int i){
    auto x = i * CHUNK % X;
    auto y = i * CHUNK / X % Y;
    auto z = i * CHUNK / X / Y;
    function(x, y, z);
  };
  tbb::parallel_for(0, N_chunks , sec_order);
}
void forXY(auto function) {
  for (int x = 0; x < X; x++)
  for (int y = 0; y < Y; y++)
    function(x, y);
}
void forXYZ(auto function) {
  for (int x = 0; x < X; x++)
  for (int y = 0; y < Y; y++)
  for (int z = 0; z < Z; z++)
    function(x, y, z);
}
void forZYX(auto function) {
  for (int z = 0; z < Z; z++)
  for (int y = 0; y < Y; y++)
  for (int x = 0; x < X; x++)
    function(x, y, z);
}
void forChunkXYZ(auto function) {
  for (int x = 0; x < X; x += CHUNK)
  for (int y = 0; y < Y; y += CHUNK)
  for (int z = 0; z < Z; z += CHUNK)
    function(x, y, z);
}
