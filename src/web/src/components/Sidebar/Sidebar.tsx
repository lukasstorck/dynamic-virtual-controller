import { Card, Stack } from "react-bootstrap";
import SettingsForm from "./SettingsForm";
import GroupControls from "./GroupControls";

export default function Sidebar() {
  return (
    <Card className="shadow-sm mb-4">
      <Card.Body>
        <Stack gap={3}>
          <h5>Settings</h5>
          <SettingsForm />
          <hr />
          <GroupControls />
        </Stack>
      </Card.Body>
    </Card>
  );
}
