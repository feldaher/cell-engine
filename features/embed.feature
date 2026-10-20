Feature: Passengers ride inside the tetrahedra
  A point embedded by barycentric weights moves with the tetrahedron that holds it.

  Scenario: An embedded point follows an affine deformation exactly
    Given a sphere mesh and points scattered inside it
    When the mesh is stretched, sheared and moved by an affine map
    Then every embedded point lands where the map sends it

  Scenario: A piece carries the passengers its source adds
    Given a piece source that adds one passenger mesh
    When its piece is built
    Then the piece has that passenger, embedded in the piece's tetrahedra
