const canvas = document.getElementById("canvas")
const gl = canvas.getContext("webgl2")

// Shaders
const S = {}
// Programs
const P = {}
// Shader uniforms
const U = {}
// Vertex attributes
const A = {}
// Textures
const T = {}
// Objects
const O = {}
// Buffers
const B = {}

const N_int8 = 1
const N_int16 = 2
const N_stride = 6 * N_int16 + 4 * N_int8
const N_time_samples = 120
const times = Array(N_time_samples).fill(0)

const vertex_array = new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
])

const size = [100, 100]

// setup GLSL program

P.renderer = gl.createProgram()
P.compositor = gl.createProgram()

S.renderVert = gl.createShader(gl.VERTEX_SHADER)
S.renderFrag = gl.createShader(gl.FRAGMENT_SHADER)
S.compositVert = gl.createShader(gl.VERTEX_SHADER)
S.compositFrag = gl.createShader(gl.FRAGMENT_SHADER)

gl.shaderSource(S.renderVert,
`#version 300 es
precision highp float;
precision lowp int;

in vec2 a_position;

void main() {
    gl_Position = vec4(a_position, 0, 1);
}`)

gl.shaderSource(S.renderFrag,
`#version 300 es
precision highp float;
precision lowp int;

layout(location=0) out vec4 c_diffuse;
layout(location=1) out vec4 c_reflection;

void main() {
  c_diffuse = vec4(1,0,0,1);
  c_reflection = vec4(0,1,0,1);
}`)

gl.shaderSource(S.compositVert,
`#version 300 es
precision highp float;
precision lowp int;

in vec2 a_texCoord;
out vec2 v_texCoord;

void main(){
  gl_Position = vec4(a_texCoord, 0, 1);
  v_texCoord = 0.5 + 0.5*a_texCoord;
}`)

gl.shaderSource(S.compositFrag,
`#version 300 es
precision highp float;
precision lowp int;

uniform highp sampler2D u_diffuse;
uniform highp sampler2D u_reflection;

in vec2 v_texCoord;
out vec4 c_out;

void main() {
  if(v_texCoord.x < 0.5) {
    c_out.rgb = texture(u_diffuse, v_texCoord).rgb;
  } else {
    c_out.rgb = texture(u_reflection, v_texCoord).rgb;
  }
  c_out.a = 1.0;
}`)

gl.compileShader(S.renderVert)
gl.compileShader(S.renderFrag)
gl.compileShader(S.compositVert)
gl.compileShader(S.compositFrag)

gl.attachShader(P.renderer, S.renderVert)
gl.attachShader(P.renderer, S.renderFrag)
gl.attachShader(P.compositor, S.compositVert)
gl.attachShader(P.compositor, S.compositFrag)

gl.linkProgram(P.renderer)
gl.linkProgram(P.compositor)

gl.useProgram(P.renderer)

A.position = gl.getAttribLocation(P.renderer, "a_position")

T.diffuse = gl.createTexture()
gl.bindTexture(gl.TEXTURE_2D, T.diffuse)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    ...size, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, null)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

T.reflection = gl.createTexture()
gl.bindTexture(gl.TEXTURE_2D, T.reflection)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
    ...size, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, null)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)

// Create separate render buffer for storing diffuse
// and reflection passes before merging them together
B.render = gl.createFramebuffer()
gl.bindFramebuffer(gl.FRAMEBUFFER, B.render)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D, T.diffuse, 0)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1,
    gl.TEXTURE_2D, T.reflection, 0)
console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER), gl.FRAMEBUFFER_COMPLETE)

O.vertex_array = gl.createVertexArray()
gl.bindVertexArray(O.vertex_array)
B.position = gl.createBuffer()
gl.enableVertexAttribArray(A.position)
gl.bindBuffer(gl.ARRAY_BUFFER, B.position)
gl.bufferData(gl.ARRAY_BUFFER, vertex_array, gl.STATIC_DRAW)
gl.vertexAttribPointer(A.texCoord, 2, gl.FLOAT, false, 0, 0)

//////////////////////

gl.useProgram(P.compositor)
gl.bindFramebuffer(gl.FRAMEBUFFER, null)

A.texCoord = gl.getAttribLocation(P.compositor, "a_texCoord")
U.diffuse = gl.getUniformLocation(P.compositor, "u_diffuse")
U.reflection = gl.getUniformLocation(P.compositor, "u_reflection")

O.composit_array = gl.createVertexArray()
gl.bindVertexArray(O.composit_array)

B.texCoord = gl.createBuffer()
gl.enableVertexAttribArray(A.texCoord)
gl.bindBuffer(gl.ARRAY_BUFFER, B.texCoord)
gl.bufferData(gl.ARRAY_BUFFER, vertex_array, gl.STATIC_DRAW)
gl.vertexAttribPointer(A.texCoord, 2, gl.FLOAT, false, 0, 0)

// RENDER

gl.bindFramebuffer(gl.FRAMEBUFFER, B.render)
gl.viewport(0, 0, ...size)
gl.useProgram(P.renderer)
gl.bindVertexArray(O.vertex_array)
gl.drawArrays(gl.TRIANGLES, 0, 6)

////////////////

gl.bindFramebuffer(gl.FRAMEBUFFER, null)
gl.viewport(0, 0, ...size)
gl.useProgram(P.compositor)
gl.bindVertexArray(O.composit_array)

gl.uniform1i(U.diffuse, 0)
gl.uniform1i(U.reflection, 1)

gl.activeTexture(gl.TEXTURE0)
gl.bindTexture(gl.TEXTURE_2D, T.diffuse)

gl.activeTexture(gl.TEXTURE1)
gl.bindTexture(gl.TEXTURE_2D, T.reflection)

gl.drawArrays(gl.TRIANGLES, 0, 6)
