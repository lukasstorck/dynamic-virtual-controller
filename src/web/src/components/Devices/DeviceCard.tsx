import { useMemo, useState, type FC } from "react";
import { Card, Form, Button, Badge, FormControl } from "react-bootstrap";
import { type Device } from "../../types";
import { formatPing } from "../../utils/formatting";
import { useDataContext } from "../../hooks/useDataContext";

interface Props {
  device: Device;
}

const DeviceCard: FC<Props> = ({ device }) => {
  const {
    handleRenameOutput,
    user,
    usersById,
    userId,
    handleSelectOutput,
    slotPresets,
    handleSelectKeybindPreset,
    userColor,
  } = useDataContext();
  const [modifiedDeviceName, setModifiedDeviceName] = useState(device.name);
  const deviceNameModified = useMemo(() => {
    return device.name !== modifiedDeviceName;
  }, [device.name, modifiedDeviceName]);

  const toggleUserConnectionToDevice = (
    event: React.MouseEvent,
    deviceId: string
  ) => {
    const clickedDOMTagName = (
      event.target as HTMLElement
    ).tagName.toLowerCase();
    if (["button", "input", "select", "option"].includes(clickedDOMTagName))
      return;

    handleSelectOutput(
      deviceId,
      !user?.connectedDeviceIds.includes(deviceId)
    );
  };

  const userIsConnectedToDevice = useMemo(
    () => user?.connectedDeviceIds.includes(device.id),
    [user?.connectedDeviceIds]
  );

  const keybindPresetOptions = useMemo(() => {
    return ["None"].concat(Object.keys(device.keybindPresets));
  }, [device]);

  return (
    <Card
      className={
        "shadow-sm mb-3 position-relative h-100" +
        (userIsConnectedToDevice ? " border-3" : "")
      }
      onClick={(event) => toggleUserConnectionToDevice(event, device.id)}
      style={{
        cursor: "pointer",
        ...(userIsConnectedToDevice && { borderColor: userColor }),
      }}
    >
      {/* Slot Badge */}
      <Badge pill className="position-absolute top-0 end-0 translate-middle">
        {"Slot " + device.slot}
      </Badge>

      <Card.Body>
        {/* Device Name */}
        <div className="d-flex align-items-center gap-2 mb-2">
          <Form onSubmit={(event) => event.preventDefault()} className="w-100">
            <FormControl
              className="fw-bold mb-0 flex-grow-1 text-truncate border-0 p-0"
              type="text"
              value={modifiedDeviceName}
              onChange={(event) => {
                setModifiedDeviceName(event.target.value);
              }}
            />
          </Form>
          <Button
            variant="outline-success"
            className={
              "d-inline-flex align-items-center justify-content-center btn-sm flex-shrink-0 px-2 py-0" +
              (!deviceNameModified ? " invisible" : "")
            }
            onClick={(event) => {
              event.stopPropagation();
              setModifiedDeviceName(modifiedDeviceName.trim());
              handleRenameOutput(device.id, modifiedDeviceName);
            }}
          >
            <span className="material-symbols-outlined">check</span>
          </Button>
        </div>

        {/* Keybinds */}

        <div className="d-flex align-items-center gap-2 mb-2">
          <label className="form-label mb-0 small text-nowrap">Keybinds:</label>
          <select
            className="form-select form-select-sm flex-grow-1 mb-0"
            value={slotPresets[device.slot]}
            onChange={(event) => {
              event.target.blur();
              handleSelectKeybindPreset(device.slot, event.target.value);
            }}
          >
            {keybindPresetOptions.map((presetName) => (
              <option key={presetName} value={presetName}>
                {presetName}
              </option>
            ))}
          </select>
        </div>

        {/* Ping */}
        <div className="mt-2 small text-muted">
          <div>
            <strong>Ping:</strong> {formatPing(device.lastPing)}
          </div>
        </div>

        {/* Connected Users */}
        <div>
          <strong>Connected Users:</strong>
          <div>
            {device.connectedUserIds.length > 0 ? (
              <>
                {device.connectedUserIds.map((id) => (
                  <span
                    key={id}
                    className="d-inline-block px-2 py-1 rounded text-white small m-1"
                    style={{ backgroundColor: `${usersById[id].color}` }}
                  >
                    {usersById[id].name + (id === userId ? " (You)" : "")}
                  </span>
                ))}
              </>
            ) : (
              <span className="text-muted fst-italic small">
                No users connected
              </span>
            )}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
};

export default DeviceCard;
