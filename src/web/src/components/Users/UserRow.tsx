import { useMemo } from "react";

import { useDataContext } from "../../hooks/useDataContext";
import { type User } from "../../types";
import { formatLastActivity, formatPing } from "../../utils/formatting";

interface UserRowProps {
  user: User;
}

export default function UserRow({ user }: UserRowProps) {
  const { groupState, userId } = useDataContext();

  const connectedOutputDevicesString = useMemo(() => {
    const selectedDevices = groupState.devices.filter((device) =>
      user.connectedDeviceIds.includes(device.id)
    );
    const deviceNames = selectedDevices.map((device) => device.name).join(", ");
    return deviceNames;
  }, [user.connectedDeviceIds]);

  const userNameString = useMemo(() => {
    let userName = user.name;

    if (user.id === userId) userName += " (You)";
    return userName;
  }, [user.id, user.name]);

  return (
    <tr>
      <td>
        <span
          className="d-inline-block px-2 py-1 rounded m-1 small"
          style={{
            backgroundColor: user.color,
          }}
        >
          {userNameString}
        </span>
      </td>
      <td>{formatLastActivity(user.lastActivityTime)}</td>
      <td>{formatPing(user.lastPing)}</td>
      <td>{connectedOutputDevicesString}</td>
    </tr>
  );
}
