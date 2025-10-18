import { useMemo, type FC } from "react";
import { type User } from "../../types";
import { formatLastActivity, formatPing } from "../../utils/formatting";
import { useDataContext } from "../../hooks/useDataContext";

interface Props {
  user: User;
}

const UserRow: FC<Props> = ({ user }) => {
  const { devices, userId } = useDataContext();

  const connectedOutputDevicesString = useMemo(() => {
    const selectedDevices = devices.filter((device) =>
      user.selected_output_devices.includes(device.id)
    );
    const deviceNames = selectedDevices.map((device) => device.name).join(", ");
    return deviceNames;
  }, [user.selected_output_devices]);

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
      <td>{formatLastActivity(user.last_activity)}</td>
      <td>{formatPing(user.ping)}</td>
      <td>{connectedOutputDevicesString}</td>
    </tr>
  );
};

export default UserRow;
