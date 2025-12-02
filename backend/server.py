import time
import json
from collections import defaultdict
from flask import Flask, jsonify
from flask_cors import CORS
import threading

app = Flask(__name__)
CORS(app)

topology = {
    'nodes': {},  # ip -> {first_seen, last_seen, packet_count}
    'edges': defaultdict(lambda: {'count': 0, 'last_active': 0})
}

def aggregate_packet(packet):
    """
    Don't store every packet - just update counters
    This runs on every log line but keeps memory constant
    """
    src, dst = packet['src_ip'], packet['dst_ip']
    now = time.time()
    
    # Update nodes
    for ip in [src, dst]:
        if ip not in topology['nodes']:
            topology['nodes'][ip] = {
                'first_seen': now,
                'last_seen': now,
                'packet_count': 0
            }
        topology['nodes'][ip]['last_seen'] = now
        topology['nodes'][ip]['packet_count'] += 1
    
    # Update edge
    edge_key = (src, dst)
    topology['edges'][edge_key]['count'] += 1
    topology['edges'][edge_key]['last_active'] = now

def monitor_logs():
    """
    Background thread - reads logs, aggregates in memory
    This is where filtering happens
    """
    import sys
    for line in sys.stdin:  # Reads from SSH pipe
        packet = parse_debug_line(line.strip())
        if packet:
            aggregate_packet(packet)
            # Optional: Filter out noise
            # if is_interesting(packet):
            #     aggregate_packet(packet)

# Start monitoring in background
threading.Thread(target=monitor_logs, daemon=True).start()

@app.route('/api/topology')
def get_topology():
    """
    Frontend calls this every 2-3 seconds
    Returns current aggregated state
    """
    now = time.time()
    
    # Only include recently active nodes (last 30 seconds)
    active_nodes = [
        {'ip': ip, 'packets': data['packet_count']}
        for ip, data in topology['nodes'].items()
        if now - data['last_seen'] < 30
    ]
    
    # Only include recently active edges
    active_edges = [
        {
            'source': src,
            'target': dst,
            'weight': data['count']
        }
        for (src, dst), data in topology['edges'].items()
        if now - data['last_active'] < 30
    ]
    
    return jsonify({
        'nodes': active_nodes,
        'edges': active_edges,
        'timestamp': now
    })

@app.route('/api/stats')
def get_stats():
    return jsonify({
        'total_nodes': len(topology['nodes']),
        'active_connections': len([e for e in topology['edges'].values() 
                                   if time.time() - e['last_active'] < 30]),
        'total_packets': sum(n['packet_count'] for n in topology['nodes'].values())
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)