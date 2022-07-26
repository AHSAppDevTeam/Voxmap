#include <tbb/blocked_range3d.h>
#include <tbb/parallel_for.h>
#include <tbb/tbb.h>

const int X = 1024;
const int Y = 256;
const int Z = 32;
const int CHUNK = Z;

const int LEN[3] = {X, Y, Z};
const int AREA[3] = {Y * Z, X *Z, X *Y};

void parXYZ(auto function) {
  auto sec_order = [&](int i){
    auto x = i % X;
    auto y = i / X % Y;
    auto z = i / X / Y;
    function(x, y, z);
  };
  tbb::parallel_for(0, X*Y*Z, sec_order);
}
void parChunkXYZ(auto function) {
  auto sec_order = [&](int i){
    auto x = i * CHUNK % X;
    auto y = i * CHUNK / X % Y;
    auto z = i * CHUNK / X / Y;
    function(x, y, z);
  };
  tbb::parallel_for(0, X*Y*Z/CHUNK/CHUNK/CHUNK , sec_order);
}
void forXYZ(auto function) {
  for (int z = 0; z < Z; z++)
  for (int y = 0; y < Y; y++)
  for (int x = 0; x < X; x++)
    function(x, y, z);
}
void forChunkXYZ(auto function) {
  for (int z = 0; z < Z; z += CHUNK)
  for (int y = 0; y < Y; y += CHUNK)
  for (int x = 0; x < X; x += CHUNK)
    function(x, y, z);
}
