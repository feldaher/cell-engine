Feature: A plane cuts a body into pieces
  The world-space blade is carried into the piece's rest space by its best-fit pose, and each
  side is rebuilt as a fresh soft body embedded in the parent.

  Scenario: Cutting a sphere through its middle makes two halves
    Given a sphere piece resting on the floor
    When it is cut by a vertical plane through its centre
    Then there are two pieces
    And their rest volumes add up to the parent's within 3 percent

  Scenario: A cut near the edge that would leave a crumb is refused
    Given a sphere piece resting on the floor
    When it is cut by a vertical plane that only grazes it
    Then the cut plan splits nothing

  Scenario: Children take over the parent's motion
    Given a sphere piece moving sideways
    When it is cut through its centre and the children are swapped in
    Then each child's mean velocity matches the parent's within 1 percent
