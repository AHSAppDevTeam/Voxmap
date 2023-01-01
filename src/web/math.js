const floor = x => Math.floor(x)
const fract = x => x - floor(x)
const pow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p)

// smoothstep
const smoothstep_polynomial = x => x * x * (3 - 2 * x)
const smoothstep = (x, a, b) => x < a ? 0 : x >= b ? 1 : smoothstep_polynomial((x - a) / (b - a))

// clamp
const clamps = (x, a, b) => Math.min(Math.max(x, a), b)
const clamp = (x, a) => clamps(x, -a, a) // symmetrical clamp

// field-of-view
const fstop = (fov) => 1 / Math.tan(fov * Math.PI / 360)

// vector magnitude (sqrt of sum of squares)
const magnitude = v => Math.sqrt(v.reduce((a, b) => a + b * b, 0))

// 4x4 matrix operations

const m4 = {

    projection: (f, ratio, near, far) => ([
        f / Math.sqrt(ratio), 0, 0, 0,
        0, f * Math.sqrt(ratio), 0, 0,
        0, 0, (near + far) / (near - far), -1,
        0, 0, 2 * near * far / (near - far), 0,
    ]),

    inv_projection: (f, ratio, near, far) => ([
        Math.sqrt(ratio) / f, 0, 0, 0,
        0, 1 / Math.sqrt(ratio) / f, 0, 0,
        0, 0, 0, (near - far) / (2 * near * far),
        0, 0, -1, (near + far) / (2 * near * far)
    ]),

    _multiply: (a, b) => {
        const a00 = a[0 * 4 + 0];
        const a01 = a[0 * 4 + 1];
        const a02 = a[0 * 4 + 2];
        const a03 = a[0 * 4 + 3];
        const a10 = a[1 * 4 + 0];
        const a11 = a[1 * 4 + 1];
        const a12 = a[1 * 4 + 2];
        const a13 = a[1 * 4 + 3];
        const a20 = a[2 * 4 + 0];
        const a21 = a[2 * 4 + 1];
        const a22 = a[2 * 4 + 2];
        const a23 = a[2 * 4 + 3];
        const a31 = a[3 * 4 + 1];
        const a30 = a[3 * 4 + 0];
        const a32 = a[3 * 4 + 2];
        const a33 = a[3 * 4 + 3];
        const b00 = b[0 * 4 + 0];
        const b01 = b[0 * 4 + 1];
        const b02 = b[0 * 4 + 2];
        const b03 = b[0 * 4 + 3];
        const b10 = b[1 * 4 + 0];
        const b11 = b[1 * 4 + 1];
        const b12 = b[1 * 4 + 2];
        const b13 = b[1 * 4 + 3];
        const b20 = b[2 * 4 + 0];
        const b21 = b[2 * 4 + 1];
        const b22 = b[2 * 4 + 2];
        const b23 = b[2 * 4 + 3];
        const b30 = b[3 * 4 + 0];
        const b31 = b[3 * 4 + 1];
        const b32 = b[3 * 4 + 2];
        const b33 = b[3 * 4 + 3];
        return [
            b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
            b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
            b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
            b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,
            b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
            b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
            b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
            b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,
            b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
            b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
            b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
            b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,
            b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
            b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
            b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
            b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
        ];
    },

    multiply: (...m) => m.reduce(m4._multiply),

    "v4": (m, v) => {
        const m11 = m[0],
            m12 = m[4],
            m13 = m[8],
            m14 = m[12],
            m21 = m[1],
            m22 = m[5],
            m23 = m[9],
            m24 = m[13],
            m31 = m[2],
            m32 = m[6],
            m33 = m[10],
            m34 = m[14],
            m41 = m[3],
            m42 = m[7],
            m43 = m[11],
            m44 = m[15]

        const v1 = v[0],
            v2 = v[1],
            v3 = v[2],
            v4 = v[3]

        return [
            m11 * v1 + m12 * v2 + m13 * v3 + m14 * v4,
            m21 * v1 + m22 * v2 + m23 * v3 + m24 * v4,
            m31 * v1 + m32 * v2 + m33 * v3 + m34 * v4,
            m41 * v1 + m42 * v2 + m43 * v3 + m44 * v4
        ]
    },

    translation: (tx, ty, tz) => ([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        tx, ty, tz, 1,
    ]),

    xRotation: (angleInRadians) => {
        const c = Math.cos(angleInRadians);
        const s = Math.sin(angleInRadians);

        return [
            1, 0, 0, 0,
            0, c, s, 0,
            0, -s, c, 0,
            0, 0, 0, 1,
        ];
    },

    yRotation: (angleInRadians) => {
        const c = Math.cos(angleInRadians);
        const s = Math.sin(angleInRadians);

        return [
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            0, 0, 0, 1,
        ];
    },

    zRotation: function(angleInRadians) {
        const c = Math.cos(angleInRadians);
        const s = Math.sin(angleInRadians);

        return [
            c, s, 0, 0,
            -s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
    },

    scaling: (sx, sy, sz) => ([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,
        0, 0, 0, 1,
    ]),
}
