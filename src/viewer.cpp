#include <iostream>
#include <string>

#include "../libs/glad/glad.h"
#include <GLFW/glfw3.h>

#include "../libs/learnopengl.h"
#define STB_IMAGE_IMPLEMENTATION
#include "../libs/stb_image.h"

void framebuffer_size_callback(GLFWwindow *window, int width, int height);
//void mouse_callback(GLFWwindow* window, double xpos, double ypos);
//void scroll_callback(GLFWwindow* window, double xoffset, double yoffset);
void processInput(GLFWwindow *window);

// settings
const unsigned int SCR_WIDTH = 800;
const unsigned int SCR_HEIGHT = 450;
const int TAA = 2;

int main() {
  // glfw: initialize and configure
  // ------------------------------
  glfwInit();
  glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
  glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
  glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

#ifdef __APPLE__
  glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);
#endif

  // glfw window creation
  // --------------------
  GLFWwindow *window =
    glfwCreateWindow(SCR_WIDTH, SCR_HEIGHT, "VoxMap", NULL, NULL);
  if (window == NULL) {
    std::cout << "Failed to create GLFW window" << std::endl;
    glfwTerminate();
    return -1;
  }
  glfwMakeContextCurrent(window);
  glfwSetFramebufferSizeCallback(window, framebuffer_size_callback);
  //glfwSetCursorPosCallback(window, mouse_callback);
  //glfwSetScrollCallback(window, scroll_callback);

  // tell GLFW to capture our mouse
  //glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

  // glad: load all OpenGL function pointers
  // ---------------------------------------
  if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
    std::cout << "Failed to initialize GLAD" << std::endl;
    return -1;
  }

  // build and compile our shader zprogram
  // ------------------------------------
  Shader marchShader("src/shaders/march.vertex.glsl", "src/shaders/march.fragment.glsl");
  Shader filterShader("src/shaders/filter.vertex.glsl", "src/shaders/filter.fragment.glsl");

  // set up vertex data (and buffer(s)) and configure vertex attributes
  // ------------------------------------------------------------------
  float quadVertices[] = {// 2 triangles' vertex positions
    -1., +1.,
    -1., -1.,
    +1., -1.,

    -1., +1.,
    +1., -1.,
    +1., +1.
  };
  unsigned int quadVertexArray, quadVertexBuffer;
  glGenVertexArrays(1, &quadVertexArray);
  glGenBuffers(1, &quadVertexBuffer);
  glBindVertexArray(quadVertexArray);
  glBindBuffer(GL_ARRAY_BUFFER, quadVertexBuffer);
  glBufferData(GL_ARRAY_BUFFER, sizeof(quadVertices), quadVertices, GL_STATIC_DRAW);
  glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, (void *)0);
  glEnableVertexAttribArray(0);

  // load and create a texture
  // -------------------------
  unsigned int mapTexture;
  int width, height, nrChannels;
  // tell stb_image.h to flip loaded texture's on the y-axis.
  stbi_set_flip_vertically_on_load(true);
  glGenTextures(1, &mapTexture);
  glBindTexture(GL_TEXTURE_2D, mapTexture);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
  unsigned char *data = stbi_load("maps/texture.png", &width, &height, &nrChannels, 0);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB8UI, width, height, 0, GL_RGB_INTEGER, GL_UNSIGNED_BYTE, data);
  stbi_image_free(data);

  // shader configuration
  // --------------------
  marchShader.use();
  marchShader.setVec2("iResolution", SCR_WIDTH, SCR_HEIGHT);
  marchShader.setInt("mapTexture", 0);

  filterShader.use();
  for(int i = 0; i < TAA*TAA; i++) {
    filterShader.setInt("marchTexture" + std::to_string(i), i);
  }

  // framebuffer configuration
  // -------------------------
  unsigned int frameBuffer[TAA*TAA];
  unsigned int frameTexture[TAA*TAA];
  GLenum textureEnum[10] = { 
    GL_TEXTURE0, GL_TEXTURE1, GL_TEXTURE2, GL_TEXTURE3,
    GL_TEXTURE4, GL_TEXTURE5, GL_TEXTURE6, GL_TEXTURE3,
    GL_TEXTURE8, GL_TEXTURE9
  };
  for(int i = 0; i < TAA*TAA; i++) {
    unsigned int buffer;
    glGenFramebuffers(1, &buffer);
    glBindFramebuffer(GL_FRAMEBUFFER, buffer);
    // create a color attachment texture
    unsigned int texture;
    glGenTextures(1, &texture);
    glBindTexture(GL_TEXTURE_2D, texture);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, SCR_WIDTH, SCR_HEIGHT, 0, GL_RGB, GL_UNSIGNED_BYTE, NULL);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texture, 0);
    // now that we actually created the framebuffer and added all attachments we want to check if it is actually complete now
    if (glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
      std::cout << "ERROR::FRAMEBUFFER:: Framebuffer is not complete!" << std::endl;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    frameBuffer[i] = buffer;
    frameTexture[i] = texture;
  }

  // draw as wireframe
  //glPolygonMode(GL_FRONT_AND_BACK, GL_LINE);


  // render loop
  // -----------
  float deltaTime = 0.0f;
  float lastFrame = 0.0f;
  float t = glfwGetTime();
  unsigned int frame = 0;
  unsigned int frameBufferIndex = 0;
  while (!glfwWindowShouldClose(window)) {

    // input
    // -----
    processInput(window);
    t = glfwGetTime();
    frame++;
    frameBufferIndex = frame % (TAA*TAA);
    // uniforms!

    // render
    // ------
    // bind to framebuffer and draw scene as we normally would to color texture
    glBindFramebuffer(GL_FRAMEBUFFER, frameBuffer[frameBufferIndex]);
    marchShader.use();
    marchShader.setVec2("iResolution", SCR_WIDTH, SCR_HEIGHT);
    marchShader.setFloat("iTime", t);
    marchShader.setVec3("iCamRot", 0.1, 0.1, 0.1);
    marchShader.setIvec3("iCamCellPos", 381, 128, 3);
    marchShader.setVec3("iCamFractPos", 0.55, 0.1, 0.1);
    marchShader.setInt("iFrame", frame);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, mapTexture);
    glBindVertexArray(quadVertexArray);
    glDrawArrays(GL_TRIANGLES, 0, 6);

    // now bind back to default framebuffer and draw a quad plane with the attached framebuffer color texture
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    filterShader.use();
    filterShader.setInt("iFrame", frame);
    filterShader.setInt("iTAA", TAA);

    glBindVertexArray(quadVertexArray);
    // use the color attachment texture as the texture of the quad plane
    for(int i = 0; i < TAA*TAA; i++){
      glActiveTexture(textureEnum[i]);
      glBindTexture(GL_TEXTURE_2D, frameTexture[i]);
    }
    glDrawArrays(GL_TRIANGLES, 0, 6);

    // glfw: swap buffers and poll IO events (keys pressed/released, mouse moved
    // etc.)
    // -------------------------------------------------------------------------------
    glfwSwapBuffers(window);
    glfwPollEvents();
  }

  // optional: de-allocate all resources once they've outlived their purpose:
  // ------------------------------------------------------------------------
  glDeleteVertexArrays(1, &quadVertexArray);
  glDeleteBuffers(1, &quadVertexBuffer);

  // glfw: terminate, clearing all previously allocated GLFW resources.
  // ------------------------------------------------------------------
  glfwTerminate();
  return 0;
}

// process all input: query GLFW whether relevant keys are pressed/released this
// frame and react accordingly
// ---------------------------------------------------------------------------------------------------------
void processInput(GLFWwindow *window) {
  if (glfwGetKey(window, GLFW_KEY_ESCAPE) == GLFW_PRESS)
    glfwSetWindowShouldClose(window, true);
}

// glfw: whenever the window size changed (by OS or user resize) this callback
// function executes
// ---------------------------------------------------------------------------------------------
void framebuffer_size_callback(GLFWwindow *window, int width, int height) {
  // make sure the viewport matches the new window dimensions; note that width
  // and height will be significantly larger than specified on retina displays.
  glViewport(0, 0, width, height);
}
