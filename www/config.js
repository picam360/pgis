var pgis_conf = {
    "camera_conn": "bluetooth",
    "camera_option_name": "ble_insta360x3",
    "camera_options": {
        "ble_insta360x3": {
            "url": "http://192.168.42.1:80",
            'service_guid': '0000be80-0000-1000-8000-00805f9b34fb',
            'primary_service_guid': '0000be80-0000-1000-8000-00805f9b34fb',
            'characteristic_write_guid': '0000be81-0000-1000-8000-00805f9b34fb',
            'characteristic_read_guid': '0000be82-0000-1000-8000-00805f9b34fb',
            'command_values': {
                'take_picture': data = new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x03, 0x00, 0x02, 0x0C, 0x00, 0x00, 0x80, 0x00, 0x00]),
                'read_response': data = new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x0E, 0xC8, 0x02, 0x0C, 0x00, 0x00, 0x80, 0x00, 0x00]),
                '_read_response': data = new Uint8Array([0x07, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
            }
        },
        "osc_thetax": {
            "url": "http://THETAYR15104038.local"
        }
    }
}