#include <oneapi/tbb/blocked_range3d.h>
#include <oneapi/tbb/parallel_for.h>
#include <tbb/tbb.h>

const int X = 1024;
const int Y = 256;
const int Z = 32;

const int LEN[3] = {X, Y, Z};
const int AREA[3] = {Y * Z, X *Z, X *Y};
namespace detail {
using namespace oneapi;
void forXYZ(auto function) {
  tbb::parallel_for(0, X*Y*Z, function);
}
} // namespace detail
#define FOR_XYZ_STEP(DELTA)                                                    \
  for (int z = 0; z < Z; z += DELTA)                                           \
    for (int y = 0; y < Y; y += DELTA)                                         \
      for (int x = 0; x < X; x += DELTA)

#define FOR_XYZ FOR_XYZ_STEP(1)
