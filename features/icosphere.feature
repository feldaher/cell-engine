Feature: A sphere with a topology we know
  A surface pulled out of a signed distance field is not reliably manifold, and a volume
  constraint or a membrane needs one that is. Subdividing an icosahedron gives it by construction.

  Scenario Outline: The sphere is closed and the right size
    Given an icosphere of radius 2 subdivided <depth> times
    Then it has 20 times 4 to the <depth> triangles
    And every edge is shared by exactly two triangles
    And every vertex is 2 from the centre
    And the volume it encloses is under the sphere's by <under> percent, being inscribed

    Examples:
      | depth | under |
      | 1     | 12.7  |
      | 2     | 3.4   |
      | 3     | 0.9   |

  Scenario: Triangles are wound outward
    Given an icosphere of radius 2 subdivided 2 times
    Then every triangle's normal points away from the centre

  Scenario: A sphere can be asked for a volume rather than a radius
    Given an icosphere built to enclose the volume of a 100 micrometre sphere
    Then the volume it encloses is that volume
    And its radius is a little larger than 100 micrometres

  Scenario: Merging spheres keeps each one closed
    Given two icospheres merged into one mesh
    Then the mesh has both spheres' triangles
    And the volume it encloses is the sum of the two
