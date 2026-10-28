Feature: The pure parts of the jelly renderer
  The renderer draws soft-body pieces with a palette of material colours and cuts sections
  through a packed list of SDF primitives. The app supplies the palette, the primitives and,
  optionally, WGSL hooks; the engine knows nothing about cells.

  Scenario: A palette packs to the layout the shaders read
    Given a variety with a background, a scatter colour and a colour for material 3
    When it is packed for 24 material slots
    Then the packed palette holds 30 vec4s
    And slot 2 is the background in linear colour
    And material 3 has its own colour and material 5 takes the scatter colour
    And the optics slot holds refraction, emissive and gloss

  Scenario: Colours convert between sRGB hex and linear exactly enough to round-trip
    Then every 8-bit grey level survives hex to linear and back

  Scenario: Primitives pack with their op and blend
    Given a body of a union part, a subtracted part and one organelle
    When they are packed
    Then there are three primitives of 12 floats each
    And the subtracted part carries op 1 and its blend
    And the organelle carries op 0

  Scenario: The hidden-material mask survives the float uniform
    Given the materials 0 to 23
    Then their mask is exact as a 32-bit float
    And each of them reads back as hidden
    And a mask asked to hide material 24 is refused

  Scenario: Hooks the app leaves out get the engine's defaults
    When the shader prelude is composed without hooks
    Then it defines every organelle hook once
    And it defines MATERIAL_SLOTS, WALL_MAT and SCAR_MAT
    When the prelude is composed with an app hook for the organelle surface
    Then the app's surface hook is used and the other hooks keep their defaults

  Scenario: Constants are written as WGSL floats
    When the constants a = 2 and b = 0.25 are written
    Then the text declares a as 2.0 and b as 0.25
