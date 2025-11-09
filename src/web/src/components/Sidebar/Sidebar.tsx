import { Card, Stack } from "react-bootstrap";

import GroupControls from "./GroupControls";
import UserConfiguration from "./UserConfiguration";

export default function Sidebar() {
  return (
    <Card className="shadow-sm mb-4">
      <Card.Body>
        <Stack gap={3}>
          <h5>Settings</h5>
          <UserConfiguration />
          <hr />
          <GroupControls />
        </Stack>
      </Card.Body>
    </Card>
  );
}
