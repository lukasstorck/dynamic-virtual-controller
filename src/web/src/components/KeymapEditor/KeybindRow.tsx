import { Col, Row } from "react-bootstrap";

import type { Keybind } from "../../types";

interface KeybindRowProps {
  keybind: Keybind;
}

export default function KeybindRow({ keybind }: KeybindRowProps) {
  return (
    <Row className="small text-muted border-bottom py-1">
      <Col xs={6}>{keybind.key || "-"}</Col>
      <Col xs={6}>{keybind.event || "-"}</Col>
    </Row>
  );
}
