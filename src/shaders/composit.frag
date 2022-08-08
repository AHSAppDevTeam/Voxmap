uniform highp sampler2D u_diffuse;
uniform highp sampler2D u_reflection;

varying vec2 v_texCoord;

void main() {
  vec3 diffuseCol = texture2D(u_diffuse, v_texCoord).rgb;
  vec3 reflectCoord = texture2D(u_reflection, v_texCoord).rgb;
  vec3 reflectCol = texture2D(u_diffuse, reflectCoord.xy).rgb;
  gl_FragColor.rgb = mix(diffuseCol, reflectCol, reflectCoord.z);
  gl_FragColor.a = 1.0;
}
