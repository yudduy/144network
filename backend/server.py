import os
import re
import time
import threading
import subprocess
from collections import defaultdict
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

topology = {
    'nodes': {},
    'edges': defaultdict(lambda: {'count': 0, 'last_active': 0})
}
topology_lock = threading.Lock()

INTERFACE = os.environ.get('CAPTURE_INTERFACE', 'tun0')
STALE_THRESHOLD = 30


def parse_tcpdump_line(line):
    match = re.search(r'IP (\d+\.\d+\.\d+\.\d+)\.\d+ > (\d+\.\d+\.\d+\.\d+)\.\d+:', line)
    if match:
        return {'src_ip': match.group(1), 'dst_ip': match.group(2), 'timestamp': time.time()}
    return None


def aggregate_packet(packet):
    with topology_lock:
        src, dst = packet['src_ip'], packet['dst_ip']
        now = packet['timestamp']

        for ip in [src, dst]:
            if ip not in topology['nodes']:
                topology['nodes'][ip] = {'first_seen': now, 'last_seen': now, 'packet_count': 0}
            topology['nodes'][ip]['last_seen'] = now
            topology['nodes'][ip]['packet_count'] += 1

        edge_key = (src, dst)
        topology['edges'][edge_key]['count'] += 1
        topology['edges'][edge_key]['last_active'] = now


def capture_packets():
    process = subprocess.Popen(
        ['sudo', 'tcpdump', '-i', INTERFACE, '-n', '-l', 'ip'],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    for line in iter(process.stdout.readline, b''):
        packet = parse_tcpdump_line(line.decode('utf-8', errors='replace').strip())
        if packet:
            aggregate_packet(packet)


@app.route('/api/topology')
def get_topology():
    now = time.time()
    with topology_lock:
        active_nodes = [
            {'ip': ip, 'packets': data['packet_count']}
            for ip, data in topology['nodes'].items()
            if now - data['last_seen'] < STALE_THRESHOLD
        ]
        active_edges = [
            {'source': src, 'target': dst, 'weight': data['count']}
            for (src, dst), data in topology['edges'].items()
            if now - data['last_active'] < STALE_THRESHOLD
        ]
    return jsonify({'nodes': active_nodes, 'edges': active_edges, 'timestamp': now})


@app.route('/api/stats')
def get_stats():
    now = time.time()
    with topology_lock:
        total_nodes = len(topology['nodes'])
        active_connections = sum(1 for data in topology['edges'].values() if now - data['last_active'] < STALE_THRESHOLD)
        total_packets = sum(node['packet_count'] for node in topology['nodes'].values())
    return jsonify({'total_nodes': total_nodes, 'active_connections': active_connections, 'total_packets': total_packets})


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'timestamp': time.time()})


if __name__ == '__main__':
    threading.Thread(target=capture_packets, daemon=True).start()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)), threaded=True)
