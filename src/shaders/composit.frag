uniform highp sampler2D u_diffuse;
uniform highp sampler2D u_reflection;

in vec2 v_texCoord;
out vec4 c_out;

void main() {
  vec3 diffuseCol = texture(u_diffuse, v_texCoord).rgb;
  vec3 reflectCoord = texture(u_reflection, v_texCoord).rgb;
  vec3 reflectCol = texture(u_diffuse, reflectCoord.xy).rgb;
  c_out.rgb = mix(diffuseCol, reflectCol, reflectCoord.z);
  c_out.a = 1.0;
}
