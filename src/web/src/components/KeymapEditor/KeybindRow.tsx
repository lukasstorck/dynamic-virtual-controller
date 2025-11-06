import { Row, Col } from "react-bootstrap";
import type { Keybind } from "../../types";

export default function KeybindRow({ keybind }: { keybind: Keybind }) {
  return (
    <Row className="small text-muted border-bottom py-1">
      <Col xs={6}>{keybind.key || "-"}</Col>
      <Col xs={6}>{keybind.event || "-"}</Col>
    </Row>
  );
}
